const { tokens, protocols } = require("hardlydifficult-ethereum-contracts");

contract("uniswap ethToUsdc", accounts => {
  const protocolOwner = accounts[0];
  let exchange;
  let usdc;

  before(async () => {
    const uniswap = await protocols.uniswap.deploy(web3, protocolOwner);
    usdc = await tokens.usdc.deploy(web3, accounts[9], protocolOwner);

    const tx = await uniswap.createExchange(usdc.address, {
      from: protocolOwner
    });
    exchange = await protocols.uniswap.getExchange(
      web3,
      tx.logs[0].args.exchange
    );
    await usdc.mint(protocolOwner, "10000000000", { from: protocolOwner });
    await usdc.approve(exchange.address, -1, { from: protocolOwner });
    await exchange.addLiquidity(
      "1",
      "10000000000",
      Math.round(Date.now() / 1000) + 60,
      {
        from: protocolOwner,
        value: "10000000000"
      }
    );
  });

  it.only("Can read ethToUSDC value", async () => {
    const value = await exchange.getEthToTokenInputPrice(
      web3.utils.toWei("1", "ether")
    );
    assert.notEqual(value.toString(), 0);
    assert(value.gt(0));
  });
});
