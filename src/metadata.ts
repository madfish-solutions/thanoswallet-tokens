import { BigMapAbstraction, TezosToolkit } from "@taquito/taquito";
import { loadContract, validateContractAddress } from "./contracts";
import {
  ContractNotFoundError,
  FetchURLError,
  InvalidContractAddressError,
  InvalidNetworkNameError,
  InvalidRpcIdError
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

const utf8Decoder = new TextDecoder("utf-8");
function hexToUTF8(str1: string) {
  const bytes = [];
  for (let i = 0; i < str1.length; i += 2) {
    bytes.push(parseInt(str1.substr(i, 2), 16));
  }
  return utf8Decoder.decode(Uint8Array.from(bytes));
}

export async function getTokenMetadata(
  tezos: TezosToolkit,
  contractAddress: string,
  toolkitNetworkId?: string,
  key?: string
): Promise<any> {
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
        return fetch(rawStorageKey).then(response => {
          if (response.ok) {
            return response.json();
          }
          console.error(response.status);
          throw new FetchURLError(
            `Error received while fetching ${rawStorageKey}`,
            { response }
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
          tezos,
          contractAddress,
          expectedNetworkId,
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
  if (storage.token_metadata instanceof BigMapAbstraction) {
    const metadata: BigMapAbstraction = storage.token_metadata;
    return metadata.get(key || "0");
  }
  if (key) {
    return storage[key];
  }
  return storage;
}
