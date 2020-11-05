import BigNumber from "bignumber.js";
import { TezosToolkit } from "@taquito/taquito";
import { getTokenMetadata } from "../src";

// const mainnetToolkit = new TezosToolkit("https://mainnet-tezos.giganode.io");
const carthagenetToolkit = new TezosToolkit(
  "https://testnet-tezos.giganode.io"
);

describe("getTokenMetadata", () => {
  describe("TZIP-16 standart compliance", () => {
    it("gets data stored immediately in the contract", async () => {
      expect(
        await getTokenMetadata(
          carthagenetToolkit,
          "KT1XRT495WncnqNmqKn4tkuRiDJzEiR4N2C9",
          "carthagenet"
        )
      ).toEqual({
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
  });
});
