import { BigMapAbstraction } from "@taquito/taquito";
import { loadContract, validateContractAddress } from "./contracts";
import {
  ContractNotFoundError,
  FetchURLError,
  InvalidContractAddressError,
  InvalidNetworkNameError,
  InvalidRpcIdError,
  NotEnoughCredentialsError,
  NetworkConfig
} from "./types";

const STORAGE_KEY_REGEX = /^tezos-storage:./;
const OTHER_CONTRACT_KEY_REGEX = /^\/\/(KT[A-z0-9]+)(\.[A-z0-9]+)?\/([^/]+)/;
const RPC_ID_TAG_REGEX = /^Net[A-z0-9]{12}$/;
const URL_PATTERN = /^((?:http(s)?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=.]+)|(http(s)?:\/\/localhost:[0-9]+)$/;
const KNOWN_CHAIN_IDS = new Map([
  ["NetXdQprcVkpaWU", "mainnet"],
  ["NetXjD3HPJJjmcd", "carthagenet"],
  ["NetXm8tYqnMWky1", "delphinet"]
]);
const FA2_TOKEN_METADATA_CALLBACKS = new Map([
  ["NetXdQprcVkpaWU", "KT1FCdgksuWJPLKfkgLU4BGxEjDyPBMgs4Rw"],
  ["NetXjD3HPJJjmcd", "KT1Fb2LmL7fSe94TpyzNnCB2a1bLSNrrzhcF"],
  ["NetXm8tYqnMWky1", "KT1MhQ2e1omND5YwNKtRbs5rwjRN7u4seLY7"]
]);
const FA2_TOKEN_METADATA_REGISTRY_CALLBACKS = new Map([
  ["NetXdQprcVkpaWU", "KT1JkE4T6umrTh15kKSyJ8cLjNu2cdd6QtNj"],
  ["NetXjD3HPJJjmcd", "KT1VD8TGNzQaozvp4tT7htfLTpTPpzYAEwPY"],
  ["NetXm8tYqnMWky1", "KT1FeeL8fSjjsX5vs5AHhzq5cJRB83WWewMy"]
]);

const utf8Decoder = new TextDecoder("utf-8");
function hexToUTF8(str1: string) {
  const bytes = [];
  for (let i = 0; i < str1.length; i += 2) {
    bytes.push(parseInt(str1.substr(i, 2), 16));
  }
  return utf8Decoder.decode(Uint8Array.from(bytes));
}

export async function getTokenMetadata(
  contractAddress: string,
  networkConfig: NetworkConfig,
  key?: string
): Promise<any> {
  const {
    tezos,
    toolkitNetworkId,
    tokenMetadataCallbackContract: customTokenMetadataCallbackContract,
    tokenMetadataRegistryCallbackContract: customTokenMetadataRegistryCallbackContract
  } = networkConfig;
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
  if (storage.metadata instanceof BigMapAbstraction) {
    const metadata = storage.metadata;
    if (key === undefined) {
      const rawStorageKeyHex = await metadata.get("");
      if (typeof rawStorageKeyHex !== "string") {
        return metadata;
      }
      let rawStorageKey = hexToUTF8(rawStorageKeyHex);
      if (URL_PATTERN.test(rawStorageKey)) {
        return fetch(rawStorageKey)
          .then(response => {
            if (response.ok) {
              return response.json();
            }
            throw new FetchURLError(
              `Error received while fetching ${rawStorageKey}`,
              { response }
            );
          })
          .catch(e => {
            if (e instanceof FetchURLError) {
              throw e;
            }
            throw new FetchURLError(
              `Error received while fetching ${rawStorageKey}`,
              { internalError: e }
            );
          });
      }
      if (!STORAGE_KEY_REGEX.test(rawStorageKey)) {
        return null;
      }
      rawStorageKey = rawStorageKey.replace("tezos-storage:", "");
      const contractKeyResult = OTHER_CONTRACT_KEY_REGEX.exec(rawStorageKey);
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
        const rpcChainId = await tezos.rpc.getChainId();
        const expectedNetworkId =
          toolkitNetworkId || KNOWN_CHAIN_IDS.get(rpcChainId);
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
      return JSON.parse(
        hexToUTF8(
          (await metadata.get(decodeURIComponent(rawStorageKey))) as string
        )
      );
    }
    return JSON.parse(
      hexToUTF8((await metadata.get(decodeURIComponent(key))) as string)
    );
  }
  const chainId = await tezos.rpc.getChainId();
  if (storage.token_metadata instanceof BigMapAbstraction) {
    const metadata: BigMapAbstraction = storage.token_metadata;
    return metadata.get(key || "0");
  }
  if (contract.methods.token_metadata) {
    const tokenMetadataCallbackContract =
      FA2_TOKEN_METADATA_CALLBACKS.get(chainId) ||
      customTokenMetadataCallbackContract;
    if (!tokenMetadataCallbackContract) {
      throw new NotEnoughCredentialsError(
        `Failed to find callback contract for token_metadata method, you need to specify it.`,
        { fieldName: "tokenMetadataCallbackContract" }
      );
    }
    const passTokenMetadataOperation = await contract.methods
      .token_metadata(tokenMetadataCallbackContract, [key])
      .send();
    await passTokenMetadataOperation.confirmation(1);
    const storageContract = await loadContract(
      tezos,
      tokenMetadataCallbackContract
    );
    const metadataStorage = await storageContract.storage<
      Record<string, any>[]
    >();
    const metadataEntry = metadataStorage.find(
      entry => entry["0"].toFixed() === key
    );
    return (
      metadataEntry && {
        symbol: metadataEntry["1"],
        name: metadataEntry["2"],
        decimals: Number(metadataEntry["3"]),
        extras: metadataEntry["4"]
      }
    );
  }
  if (contract.methods.token_metadata_registry) {
    const tokenMetadataRegistryCallbackContract =
      FA2_TOKEN_METADATA_REGISTRY_CALLBACKS.get(chainId) ||
      customTokenMetadataRegistryCallbackContract;
    if (!tokenMetadataRegistryCallbackContract) {
      throw new NotEnoughCredentialsError(
        `Failed to find callback contract for token_metadata_registry method, you need to specify it.`,
        { fieldName: "tokenMetadataRegistryCallbackContract" }
      );
    }
    const passTokenMetadataRegistryOperation = await contract.methods
      .token_metadata_registry(tokenMetadataRegistryCallbackContract)
      .send();
    await passTokenMetadataRegistryOperation.confirmation(1);
    const registryCallbackContract = await loadContract(
      tezos,
      tokenMetadataRegistryCallbackContract
    );
    const registryCallbackStorage = await registryCallbackContract.storage<
      any
    >();
    let metadataStorageAddress = contractAddress;
    registryCallbackStorage.forEach((value: string, key: string) => {
      if (value === contractAddress) {
        metadataStorageAddress = key;
      }
    });
    if (metadataStorageAddress !== contractAddress) {
      return getTokenMetadata(metadataStorageAddress, networkConfig);
    }
  }
  if (key) {
    return storage[key];
  }
  return storage;
}
