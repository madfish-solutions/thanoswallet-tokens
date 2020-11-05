import BigNumber from "bignumber.js";
import { TezosToolkit } from "@taquito/taquito";
import { getTokenMetadata, MetadataParseErrorCode } from "../src";

const mainnetToolkit = new TezosToolkit("https://mainnet-tezos.giganode.io");
const carthagenetToolkit = new TezosToolkit(
  "https://testnet-tezos.giganode.io"
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

describe("getTokenMetadata", () => {
  describe("TZIP-16 standart compliance", () => {
    it("gets data stored immediately in the contract", async () => {
      expect(
        await getTokenMetadata(
          carthagenetToolkit,
          "KT1XRT495WncnqNmqKn4tkuRiDJzEiR4N2C9",
          "carthagenet"
        )
      ).toEqual(tzip16ExpectedMetadata);
    });

    it("tries to fetch metadata from URL specified in the contract", async () => {
      expect.assertions(1);
      try {
        await getTokenMetadata(
          mainnetToolkit,
          "KT1CSYNJ6dFcnsV4QJ6HnBFtdif8LJGPQiDM",
          "mainnet"
        );
      } catch (error) {
        expect(
          error.message.includes("https://werenode.com/contracts/token.json")
        ).toEqual(true);
      }
    });

    describe("getting data by tezos-storage URI with contract pointing", () => {
      it("gets data from another contract: network isn't specified", async () => {
        expect(
          await getTokenMetadata(
            carthagenetToolkit,
            "KT19Rzko3FEAdh2DALvhsK8ExR8q7ApnHB8W",
            "carthagenet"
          )
        ).toEqual(tzip16ExpectedMetadata);
      });

      it("gets data from another contract: network is the same as TezosToolkit instance works in, specified with chain id", async () => {
        expect(
          await getTokenMetadata(
            carthagenetToolkit,
            "KT1G4zHU4VZ2emJmn8PAXrwdpyDK1aSJCjyB",
            "carthagenet"
          )
        ).toEqual(tzip16ExpectedMetadata);
      });

      it("throws error if specified network is another than the network where TezosToolkit instance works", async () => {
        const metadataPromise = getTokenMetadata(
          carthagenetToolkit,
          "KT1LKfJaj6X9sMm92Brnh7ytEs49uENPmeQk",
          "carthagenet"
        );
        expect(metadataPromise).rejects.toHaveProperty(
          "code",
          MetadataParseErrorCode.INVALID_NETWORK_NAME
        );
        expect(metadataPromise).rejects.toBeInstanceOf(Error);
      });
    });
  });

  describe("behavior for other storage types", () => {
    it("parses metadata from '0' key of bigmap which is stored under 'token_metadata' key", async () => {
      const { extras, ...restMetadata } = await getTokenMetadata(
        carthagenetToolkit,
        "KT1MxknJbDViFcvdU69SebP8444oSsUEX2PY",
        "carthagnet"
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
      extras.forEach((value: string, key: string) => {
        expect(expectedExtrasEntries.get(key)).toEqual(value);
        expectedExtrasEntries.delete(key);
      });
      expect(expectedExtrasEntries.size).toEqual(0);
    });

    it("returns storage contents if storage doesn't match all schemas above", async () => {
      const { ledger, ...restProps } = await getTokenMetadata(
        mainnetToolkit,
        "KT1Avd4SfQT7CezSiGYXFgHNKqSyWstYRz53",
        "mainnet"
      );
      expect(restProps).toEqual({
        administrator: "tz1Ts3m2dXTXB66XN7cg5ALiAvzZY6AxrFd9",
        decimals: new BigNumber("6"),
        name: "OroPocket Silver",
        paused: false,
        symbol: "XTZSilver",
        totalSupply: new BigNumber(0)
      });
    });
  });
});
