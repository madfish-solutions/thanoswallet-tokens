import {
  BigMapAbstraction,
  ContractAbstraction,
  ContractProvider,
  MichelsonMap
} from "@taquito/taquito";
import { loadContract, validateContractAddress } from "./contracts";
import {
  ContractNotFoundError,
  FetchURLError,
  InvalidContractAddressError,
  InvalidNetworkNameError,
  InvalidRpcIdError,
  NetworkConfig
} from "./types";
const STORAGE_KEY_REGEX = /^tezos-storage:./;
const OTHER_CONTRACT_KEY_REGEX = /^\/\/(KT[A-z0-9]+)(\.[A-z0-9]+)?\/([^/]+)/;
const IPFS_URI_PATTERN = /^ipfs:\/\/([0-9A-z]+)$/;
const SHA256_URI_PATTERN = /^sha256:\/\/0x([0-9a-f]{64})\/((?:http(s)?:(%2[fF]){2})?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:%?#[\]@!$&'()*+,;=.]+)$/;
const RPC_ID_TAG_REGEX = /^Net[A-z0-9]{12}$/;
const URL_PATTERN = /^((?:http(s)?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=.]+)|(http(s)?:\/\/localhost:[0-9]+)$/;
const KNOWN_CHAIN_IDS = new Map([
  ["NetXdQprcVkpaWU", "mainnet"],
  ["NetXjD3HPJJjmcd", "carthagenet"],
  ["NetXm8tYqnMWky1", "delphinet"],
  ["NetXSp4gfdanies", "edonet"]
]);

const utf8Decoder = new TextDecoder("utf-8");
function hexToUTF8(str1: string) {
  const bytes = [];
  for (let i = 0; i < str1.length; i += 2) {
    bytes.push(parseInt(str1.substr(i, 2), 16));
  }
  return utf8Decoder.decode(Uint8Array.from(bytes));
}

async function getMetadataByKey(
  metadata: BigMapAbstraction | MichelsonMap<string, any>,
  networkConfig: NetworkConfig,
  key: string
): Promise<any> {
  let fetchUrl: string | undefined;
  if (URL_PATTERN.test(key)) {
    fetchUrl = key;
  } else if (IPFS_URI_PATTERN.test(key)) {
    // @ts-ignore
    const [_, ipfsId] = IPFS_URI_PATTERN.exec(key)!;
    fetchUrl = `https://cloudflare-ipfs.com/ipfs/${ipfsId}`;
  } else if (SHA256_URI_PATTERN.test(key)) {
    // @ts-ignore
    const [_, checksum, encodedUrl] = SHA256_URI_PATTERN.exec(key);
    fetchUrl = decodeURIComponent(encodedUrl);
  }
  if (fetchUrl) {
    return fetch(fetchUrl)
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new FetchURLError(`Error received while fetching ${fetchUrl}`, {
          response
        });
      })
      .catch(e => {
        if (e instanceof FetchURLError) {
          throw e;
        }
        throw new FetchURLError(`Error received while fetching ${fetchUrl}`, {
          internalError: e
        });
      });
  } else if (!STORAGE_KEY_REGEX.test(key)) {
    return null;
  }
  const tezosStorageKey = key.replace("tezos-storage:", "");
  const contractKeyResult = OTHER_CONTRACT_KEY_REGEX.exec(tezosStorageKey);
  if (contractKeyResult) {
    const [
      // @ts-ignore
      _,
      contractAddress,
      rawNetworkTag,
      storageKey
    ] = contractKeyResult;
    if (validateContractAddress(contractAddress) !== true) {
      throw new InvalidContractAddressError(
        `Invalid contract address ${contractAddress}`,
        { contractAddress }
      );
    }
    const networkTag = rawNetworkTag?.substr(1);
    const networkTagIsChainId =
      !!networkTag && RPC_ID_TAG_REGEX.test(networkTag);
    const rpcChainId = await networkConfig.tezos.rpc.getChainId();
    const expectedNetworkId =
      networkConfig.toolkitNetworkId || KNOWN_CHAIN_IDS.get(rpcChainId);
    if (networkTag && networkTagIsChainId && rpcChainId !== networkTag) {
      throw new InvalidRpcIdError(
        `Chain ID ${networkTag} was specified, which is not chain ID of given Tezos toolkit`,
        { chainId: networkTag }
      );
    }
    if (
      networkTag &&
      !networkTagIsChainId &&
      expectedNetworkId !== networkTag
    ) {
      throw new InvalidNetworkNameError(
        `${networkTag} network was specified, which is not network of given Tezos toolkit`,
        { name: networkTag }
      );
    }
    return getTokenMetadata(
      contractAddress,
      { ...networkConfig, toolkitNetworkId: expectedNetworkId },
      storageKey
    );
  }
  const rawData = await metadata.get(decodeURIComponent(tezosStorageKey));
  return rawData && JSON.parse(hexToUTF8(rawData as string));
}

async function isTzip16Metadata(
  metadata: BigMapAbstraction | MichelsonMap<string, any> | Record<string, any>
) {
  const storageKeyHex =
    metadata instanceof BigMapAbstraction || metadata instanceof MichelsonMap
      ? await metadata.get("")
      : metadata[""];
  return typeof storageKeyHex === "string";
}

async function parseFA12TokenMetadata(
  metadata: BigMapAbstraction | MichelsonMap<string, any>,
  networkConfig: NetworkConfig,
  key?: string
): Promise<any> {
  if (key !== undefined) {
    return JSON.parse(
      hexToUTF8((await metadata.get(decodeURIComponent(key))) as string)
    );
  }
  const rawStorageKeyHex = await metadata.get("");
  const rawStorageKey = hexToUTF8(rawStorageKeyHex);
  const metadataByKey = await getMetadataByKey(
    metadata,
    networkConfig,
    rawStorageKey
  );
  return metadataByKey;
}

async function parseFA2TokenMetadata(
  contract: ContractAbstraction<ContractProvider>,
  networkConfig: NetworkConfig,
  id: string
): Promise<any> {
  const storage = await contract.storage<any>();

  if (storage.token_metadata instanceof BigMapAbstraction) {
    const tokensMetadata: BigMapAbstraction = storage.token_metadata;
    const tokenMetadata = await tokensMetadata.get(id);
    if (!tokenMetadata) {
      return undefined;
    }
    if (await isTzip16Metadata(tokenMetadata as any)) {
      return parseFA12TokenMetadata(tokenMetadata as any, networkConfig);
    }
    const tokenMetadataMap = await (tokenMetadata as any).token_metadata_map;
    if (tokenMetadataMap && (await isTzip16Metadata(tokenMetadataMap))) {
      return parseFA12TokenMetadata(tokenMetadataMap, networkConfig);
    }
    return tokenMetadata;
  }
  return null;
}

export async function getTokenMetadata(
  contractAddress: string,
  networkConfig: NetworkConfig,
  key?: string
): Promise<any> {
  const { tezos } = networkConfig;
  let contract;
  try {
    contract = await loadContract(tezos, contractAddress);
  } catch {
    throw new ContractNotFoundError(
      `Contract ${contractAddress} was not found`,
      { contractAddress }
    );
  }
  const storage = await contract.storage<any>();
  if (
    contract.methods.token_metadata_registry ||
    contract.methods.token_metadata
  ) {
    return parseFA2TokenMetadata(contract, networkConfig, key || "0");
  }
  if (storage.metadata instanceof BigMapAbstraction) {
    const metadata: BigMapAbstraction = storage.metadata;
    return parseFA12TokenMetadata(metadata, networkConfig, key);
  }

  if (key) {
    return storage[key];
  }
  return storage;
}
