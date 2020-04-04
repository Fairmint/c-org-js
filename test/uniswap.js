const { Uniswap } = require("../");
const Networks = require("../src/networks");
let uniswap;

contract("uniswap ethToUsdc", () => {
  before(async () => {
    const network = Networks.find(e => e.name === "mainnet");
    uniswap = new Uniswap(network.provider);
    await uniswap.init();
  });

  it("Can read ethToUSDC value", async () => {
    const value = await uniswap.getEthToUSDC();

    console.log(`1 ETH is worth ~$${value.toFormat(2)}`);
    assert.notEqual(value.toString(), 0);
    assert(value.gt(0));
  });
});
