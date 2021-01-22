require("jest-fetch-mock").disableFetchMocks();
if (typeof TextDecoder === "undefined") {
  global.TextDecoder = require("util").TextDecoder;
}
