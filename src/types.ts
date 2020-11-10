export enum MetadataParseErrorCode {
  INVALID_CONTRACT_ADDRESS,
  CONTRACT_NOT_FOUND,
  INVALID_NETWORK_NAME,
  INVALID_NETWORK_RPC_ID,
  FETCH_URL_ERROR
}

export class MetadataParseError extends Error {
  constructor(
    message: string | undefined,
    public code: MetadataParseErrorCode
  ) {
    super(message);
  }
}

export type InvalidContractAddressPayload = {
  contractAddress: string;
};

export class InvalidContractAddressError extends MetadataParseError {
  constructor(
    message: string | undefined,
    public payload: InvalidContractAddressPayload
  ) {
    super(message, MetadataParseErrorCode.INVALID_CONTRACT_ADDRESS);
  }
}

export type ContractNotFoundPayload = {
  contractAddress: string;
};

export class ContractNotFoundError extends MetadataParseError {
  constructor(
    message: string | undefined,
    public payload: ContractNotFoundPayload
  ) {
    super(message, MetadataParseErrorCode.CONTRACT_NOT_FOUND);
  }
}

export type InvalidNetworkNamePayload = {
  name: string;
};

export class InvalidNetworkNameError extends MetadataParseError {
  constructor(
    message: string | undefined,
    public payload: InvalidNetworkNamePayload
  ) {
    super(message, MetadataParseErrorCode.INVALID_NETWORK_NAME);
  }
}

export type InvalidRpcIdPayload = {
  chainId: string;
};

export class InvalidRpcIdError extends MetadataParseError {
  constructor(
    message: string | undefined,
    public payload: InvalidRpcIdPayload
  ) {
    super(message, MetadataParseErrorCode.INVALID_NETWORK_RPC_ID);
  }
}

export type FetchURLErrorPayload = {
  response?: Response;
  internalError?: Error;
};

export class FetchURLError extends MetadataParseError {
  constructor(
    message: string | undefined,
    public payload: FetchURLErrorPayload
  ) {
    super(message, MetadataParseErrorCode.FETCH_URL_ERROR);
  }
}
