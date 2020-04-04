const Web3 = require("web3");
const BigNumber = require("bignumber.js");
const { protocols, tokens } = require("hardlydifficult-ethereum-contracts");

module.exports = class Uniswap {
  async init(web3Provider) {
    const web3 = new Web3(web3Provider);
    const uniswap = await protocols.uniswap.getFactory(
      web3,
      protocols.uniswap.mainnetFactoryAddress
    );
    const exchangeAddress = await uniswap.getExchange(
      tokens.usdc.mainnetAddress
    );
    this.exchange = await protocols.uniswap.getExchange(web3, exchangeAddress);
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
