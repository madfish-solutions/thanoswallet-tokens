import BigNumber from "bignumber.js";
import { MichelsonMap, TezosToolkit } from "@taquito/taquito";
import { getTokenMetadata, MetadataParseErrorCode } from "../src";

jest.setTimeout(30000);

const mainnetToolkit = new TezosToolkit("https://mainnet-tezos.giganode.io");
const delphinetToolkit = new TezosToolkit("https://testnet-tezos.giganode.io");

const tzip16ExpectedMetadata = {
  version: "0.42.1-alpha",
  license: "MIT",
  interfaces: ["TZIP-42", "TZIP-51 with sausages"],
  authors: ["Øne Úţﬀ8 <one-utf8-heavy@example.com>"],
  "extra-field": {
    name: "TheContract",
    description: "This is a test contract."
  },
  views: [
    {
      name: "multiply-the-nat",
      implementations: [
        {
          "michelson-storage-view": {
            parameter: { prim: "nat", args: [] },
            "return-type": { prim: "nat", args: [] },
            code: [
              { prim: "CAR", args: [] },
              { prim: "DUP", args: [] },
              { prim: "CDAR", args: [] },
              { prim: "SWAP", args: [] },
              { prim: "CAR", args: [] },
              { prim: "MUL", args: [] }
            ]
          }
        }
      ]
    }
  ]
};

const unexpectedSuccessHandler = <T>(res: T, done: jest.DoneCallback) => {
  done.fail(
    `The promise was expected to be rejected but it succeeded with ${JSON.stringify(
      res
    )}`
  );
};
const defaultFailureHandler = (err: any, done: jest.DoneCallback) => {
  done.fail(err);
};
const makePromiseTest = <T>(
  promise: Promise<T>,
  onAccept: (res: T, done: jest.DoneCallback) => void,
  onReject: (err: any, done: jest.DoneCallback) => void = defaultFailureHandler
) => {
  return (done: jest.DoneCallback) => {
    promise.then(res => onAccept(res, done)).catch(e => onReject(e, done));
  };
};

const expectMichelsonMapValues = (value: any, mapValues: Map<string, any>) => {
  const mapValuesCopy = new Map(mapValues.entries());
  expect(value).toBeInstanceOf(MichelsonMap);
  value.forEach((value: string, key: string) => {
    expect(mapValuesCopy.get(key)).toEqual(value);
    mapValuesCopy.delete(key);
  });
  expect(mapValuesCopy.size).toEqual(0);
};

describe("getTokenMetadata", () => {
  describe("TZIP-16 standart compliance", () => {
    it("gets data stored immediately in the contract", async () => {
      const metadataPromise = getTokenMetadata(
        "KT1Fp7dn9QoDcH2kogLTeBY1Gwy3yim4yWqC",
        {
          tezos: delphinetToolkit
        }
      );
      await expect(metadataPromise).resolves.toEqual(tzip16ExpectedMetadata);
    });

    it(
      "returns null if storage key doesn't start with 'tezos-storage:' or is valid external URI",
      makePromiseTest(
        getTokenMetadata("KT1TftZK1NTjZ22Z8jRc2S2HTJ1hPEuJ8LfC", {
          tezos: delphinetToolkit
        }),
        (res, done) => {
          expect(res).toBeNull();
          done();
        }
      )
    );

    it(
      "tries to fetch metadata from URL specified in the contract",
      makePromiseTest(
        getTokenMetadata("KT1CSYNJ6dFcnsV4QJ6HnBFtdif8LJGPQiDM", {
          tezos: mainnetToolkit
        }),
        unexpectedSuccessHandler,
        (error, done) => {
          expect(
            error.message.includes("https://werenode.com/contracts/token.json")
          ).toEqual(true);
          expect(error).toHaveProperty(
            "code",
            MetadataParseErrorCode.FETCH_URL_ERROR
          );
          done();
        }
      )
    );

    it(
      "fetches metadata from ipfs URI",
      makePromiseTest(
        getTokenMetadata(
          "KT197cMAmydiH3QH7Xjqqrf8PgX7Xq5FyDat",
          { toolkitNetworkId: "mainnet", tezos: mainnetToolkit },
          "3"
        ),
        (data, done) => {
          expect(data).toEqual({
            decimals: 0,
            icon:
              "https://ipfs.io/ipfs/QmNrhZHUaEqxhyLfqoq1mtHSipkWHeT31LNHb1QEbDHgnc",
            metadata:
              "https://ipfs.io/ipfs/QmQciQTzKD7XZddKkMPNNu5j5yvAK3pe7BiZnBDJMAUK9C",
            name: "OBJKT",
            symbol: "OBJKT"
          });
          done();
        }
      )
    );

    describe("getting data by tezos-storage URI with contract pointing", () => {
      it("throws InvalidContractAddressError if a specified contract address is invalid", async () => {
        const metadataPromise = getTokenMetadata(
          "KT1MRis6d8PsDTubqSdWoYPzChDbuKwCTC7C",
          {
            tezos: delphinetToolkit
          }
        );
        await expect(metadataPromise).rejects.toHaveProperty(
          "code",
          MetadataParseErrorCode.INVALID_CONTRACT_ADDRESS
        );
        await expect(metadataPromise).rejects.toBeInstanceOf(Error);
      });

      it(
        "gets data from another contract: network isn't specified",
        makePromiseTest(
          getTokenMetadata("KT1SyGfy1CkYFdkx2hAPEn3ztZsWNMsiRgYq", {
            tezos: delphinetToolkit
          }),
          (res, done) => {
            expect(res).toEqual(tzip16ExpectedMetadata);
            done();
          }
        )
      );

      it(
        "gets data from another contract: network is the same as TezosToolkit instance works in, specified with chain id",
        makePromiseTest(
          getTokenMetadata("KT1J6WPEyKPKzQxnQu7TYHQFPuBuHWdPcpt8", {
            tezos: delphinetToolkit
          }),
          (res, done) => {
            expect(res).toEqual(tzip16ExpectedMetadata);
            done();
          }
        )
      );

      it("throws error if specified network is another than the network where TezosToolkit instance works", async () => {
        const metadataPromise = getTokenMetadata(
          "KT1GuNs6HGekTDVqiVzMHDCKtANf1rKMpinW",
          {
            tezos: delphinetToolkit
          }
        );
        await expect(metadataPromise).rejects.toHaveProperty(
          "code",
          MetadataParseErrorCode.INVALID_NETWORK_RPC_ID
        );
        await expect(metadataPromise).rejects.toBeInstanceOf(Error);
      });
    });
  });

  describe("TZIP-12 standart compliance", () => {
    it("parses metadata from '0' (by default) key of bigmap which is stored under 'token_metadata' key", async () => {
      const { extras, ...restMetadata } = await getTokenMetadata(
        "KT1UACCYG77J1WEkfaBrRPrMRmeMv771TNPy",
        {
          tezos: delphinetToolkit
        }
      );
      expect(restMetadata).toEqual({
        token_id: new BigNumber("0"),
        symbol: "TestTokenSymbol",
        name: "TestTokenName",
        decimals: new BigNumber("8")
      });
      const expectedExtrasEntries = new Map([
        ["attr1", "val1"],
        ["attr2", "val2"]
      ]);
      expectMichelsonMapValues(extras, expectedExtrasEntries);
    });

    it("parsed metadata from specified key of bigmap which is stored under 'token_metadata' key", async () => {
      const tokenMetadata = await getTokenMetadata(
        "KT1UACCYG77J1WEkfaBrRPrMRmeMv771TNPy",
        { tezos: delphinetToolkit },
        "1"
      );
      expect(tokenMetadata).toEqual(undefined);
      const { extras, ...restMetadata } = await getTokenMetadata(
        "KT1UACCYG77J1WEkfaBrRPrMRmeMv771TNPy",
        { tezos: delphinetToolkit },
        "0"
      );
      expect(restMetadata).toEqual({
        token_id: new BigNumber("0"),
        symbol: "TestTokenSymbol",
        name: "TestTokenName",
        decimals: new BigNumber("8")
      });
    }, 60000);
  });

  describe("behavior for other storage types", () => {
    it(
      "returns storage contents if storage doesn't match all schemas above",
      makePromiseTest(
        getTokenMetadata("KT1Avd4SfQT7CezSiGYXFgHNKqSyWstYRz53", {
          tezos: mainnetToolkit
        }),
        (res, done) => {
          const { ledger, totalSupply, ...restProps } = res;
          expect(restProps).toEqual({
            administrator: "tz1Ts3m2dXTXB66XN7cg5ALiAvzZY6AxrFd9",
            decimals: new BigNumber("6"),
            name: "OroPocket Silver",
            paused: false,
            symbol: "XTZSilver"
          });
          done();
        }
      )
    );
  });

  it("throws ContractNotFoundError if a contract cannot be found", async () => {
    const metadataPromise = getTokenMetadata(
      "KT1XRT495WncnqNmqKn4tkuRiDJzEiR4N2C9",
      { tezos: mainnetToolkit }
    );
    await expect(metadataPromise).rejects.toHaveProperty(
      "code",
      MetadataParseErrorCode.CONTRACT_NOT_FOUND
    );
    await expect(metadataPromise).rejects.toBeInstanceOf(Error);
  });
});
