const { Uniswap } = require("../");

let uniswap;

contract("uniswap ethToUsdc", () => {
  before(async () => {
    uniswap = new Uniswap();
    await uniswap.init();
  });

  it("Can read ethToUSDC value", async () => {
    const value = await uniswap.getEthToUSDC();

    console.log(`1 ETH is worth ~$${value.toFormat(2)}`);
    assert.notEqual(value.toString(), 0);
    assert(value.gt(0));
  });
});
