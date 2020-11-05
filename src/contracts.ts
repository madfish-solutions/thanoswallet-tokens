import { TezosToolkit } from "@taquito/taquito";
import { ValidationResult, validateAddress } from "@taquito/utils";

export function loadContract(tezos: TezosToolkit, address: string) {
  return tezos.wallet.at(address);
}

export function isAddressValid(address: string) {
  return validateAddress(address) === ValidationResult.VALID;
}

export function isKTAddress(address: string) {
  return address?.startsWith("KT");
}

export function validateContractAddress(value: any) {
  switch (false) {
    case isAddressValid(value):
      return "Invalid address";

    case isKTAddress(value):
      return "Only KT contract address allowed";

    default:
      return true;
  }
}
