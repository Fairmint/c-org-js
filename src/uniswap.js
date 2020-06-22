const Web3 = require("web3");
const BigNumber = require("bignumber.js");
const { protocols, tokens } = require("hardlydifficult-eth");

module.exports = class Uniswap {
  async init(web3Provider) {
    const web3 = new Web3(web3Provider);
    const uniswap = await protocols.uniswapV1.getFactory(
      web3,
      protocols.uniswapV1.mainnetFactoryAddress
    );
    const exchangeAddress = await uniswap.getExchange(
      tokens.usdc.mainnetAddress
    );
    this.exchange = await protocols.uniswapV1.getExchange(
      web3,
      exchangeAddress
    );
  }

  async getEthToUSDC() {
    let value = new BigNumber(
      await this.exchange.getEthToTokenInputPrice(
        web3.utils.toWei("1", "ether")
      )
    );
    value = value.shiftedBy(-tokens.usdc.decimals);
    return value;
  }
};
