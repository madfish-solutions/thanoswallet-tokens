import BigNumber from "bignumber.js";
import { MichelsonMap, TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { getTokenMetadata, MetadataParseErrorCode } from "../src";

jest.setTimeout(30000);

const mainnetToolkit = new TezosToolkit("https://mainnet-tezos.giganode.io");
const carthagenetToolkit = new TezosToolkit(
  "https://testnet-tezos.giganode.io"
);
const delphinetToolkit = new TezosToolkit(
  "https://delphinet-tezos.giganode.io"
);

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
      expect(
        await getTokenMetadata("KT1XRT495WncnqNmqKn4tkuRiDJzEiR4N2C9", {
          tezos: carthagenetToolkit
        })
      ).toEqual(tzip16ExpectedMetadata);
    });

    it("returns null if storage key doesn't start with 'tezos-storage:'", async () => {
      expect(
        getTokenMetadata("KT1TftZK1NTjZ22Z8jRc2S2HTJ1hPEuJ8LfC", {
          tezos: delphinetToolkit
        })
      ).resolves.toBeNull();
    });

    it("tries to fetch metadata from URL specified in the contract", done => {
      getTokenMetadata("KT1CSYNJ6dFcnsV4QJ6HnBFtdif8LJGPQiDM", {
        tezos: mainnetToolkit
      })
        .then(() => done.fail())
        .catch(error => {
          expect(
            error.message.includes("https://werenode.com/contracts/token.json")
          ).toEqual(true);
          expect(error).toHaveProperty(
            "code",
            MetadataParseErrorCode.FETCH_URL_ERROR
          );
          done();
        });
    });

    describe("getting data by tezos-storage URI with contract pointing", () => {
      it("throws InvalidContractAddressError if a specified contract address is invalid", async () => {
        const metadataPromise = getTokenMetadata(
          "KT1XaMSsiQJHYwL2bHqRTXnvvw41nJQxwyVh",
          { tezos: carthagenetToolkit }
        );
        expect(metadataPromise).rejects.toHaveProperty(
          "code",
          MetadataParseErrorCode.INVALID_CONTRACT_ADDRESS
        );
        expect(metadataPromise).rejects.toBeInstanceOf(Error);
      });

      it("gets data from another contract: network isn't specified", async () => {
        expect(
          await getTokenMetadata("KT19Rzko3FEAdh2DALvhsK8ExR8q7ApnHB8W", {
            tezos: carthagenetToolkit
          })
        ).toEqual(tzip16ExpectedMetadata);
      });

      it("gets data from another contract: network is the same as TezosToolkit instance works in, specified with chain id", async () => {
        expect(
          await getTokenMetadata("KT1G4zHU4VZ2emJmn8PAXrwdpyDK1aSJCjyB", {
            tezos: carthagenetToolkit
          })
        ).toEqual(tzip16ExpectedMetadata);
      });

      it("throws error if specified network is another than the network where TezosToolkit instance works", async () => {
        const metadataPromise = getTokenMetadata(
          "KT1LKfJaj6X9sMm92Brnh7ytEs49uENPmeQk",
          { tezos: carthagenetToolkit }
        );
        expect(metadataPromise).rejects.toHaveProperty(
          "code",
          MetadataParseErrorCode.INVALID_NETWORK_NAME
        );
        expect(metadataPromise).rejects.toBeInstanceOf(Error);
      });
    });
  });

  describe("TZIP-12 standart compliance", () => {
    beforeAll(async () => {
      const privateCarthageKey = await fetch(
        "https://api.tez.ie/keys/carthagenet",
        {
          method: "POST",
          headers: { Authorization: "Bearer taquito-example" }
        }
      ).then(response => response.text());
      carthagenetToolkit.setSignerProvider(
        await InMemorySigner.fromSecretKey(privateCarthageKey)
      );
    });

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

    it("returns result from 'token_metadata' entrypoint if it's present and there is no token_metadata bigmap", async () => {
      const { extras, ...restTokenMetadata } = await getTokenMetadata(
        "KT1QJb2JRgT9jQ8D96EU5aHtPHwQzy42GtPs",
        { tezos: carthagenetToolkit },
        "1"
      );
      expect(restTokenMetadata).toEqual({
        symbol: "TK1",
        name: "",
        decimals: 0
      });
      const expectedExtrasEntries = new Map<string, string>([]);
      expectMichelsonMapValues(extras, expectedExtrasEntries);
    }, 180000);

    it("fetches metadata from contract with address returned by 'token_metadata_registry' address if it exists", done => {
      (async () => {
        const { balances, totalSupply, ...restProps } = await getTokenMetadata(
          "KT1C1eUuS7Y5FsaXryJse7vVM7CfFz6LAJaX",
          {
            tezos: carthagenetToolkit
          }
        );
        expect(restProps).toEqual({
          administrator: "KT1C1eUuS7Y5FsaXryJse7vVM7CfFz6LAJaX",
          paused: false
        });
        done();
      })();
    }, 180000);
  });

  describe("behavior for other storage types", () => {
    it("returns storage contents if storage doesn't match all schemas above", async () => {
      const { ledger, totalSupply, ...restProps } = await getTokenMetadata(
        "KT1Avd4SfQT7CezSiGYXFgHNKqSyWstYRz53",
        {
          tezos: mainnetToolkit
        }
      );
      expect(restProps).toEqual({
        administrator: "tz1Ts3m2dXTXB66XN7cg5ALiAvzZY6AxrFd9",
        decimals: new BigNumber("6"),
        name: "OroPocket Silver",
        paused: false,
        symbol: "XTZSilver"
      });
    });
  });

  it("throws ContractNotFoundError if a contract cannot be found", async () => {
    const metadataPromise = getTokenMetadata(
      "KT1XRT495WncnqNmqKn4tkuRiDJzEiR4N2C9",
      { tezos: mainnetToolkit }
    );
    expect(metadataPromise).rejects.toHaveProperty(
      "code",
      MetadataParseErrorCode.CONTRACT_NOT_FOUND
    );
    expect(metadataPromise).rejects.toBeInstanceOf(Error);
  });
});
