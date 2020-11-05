import { RpcClient } from "@taquito/rpc";

export function loadChainId(rpcUrl: string) {
  const rpc = new RpcClient(rpcUrl);
  return rpc.getChainId();
}
