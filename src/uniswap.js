const Web3 = require("web3");
const BigNumber = require("bignumber.js");
const Networks = require("./networks");
const { protocols, tokens } = require("hardlydifficult-ethereum-contracts");

module.exports = class Uniswap {
  async init() {
    const network = Networks.find(e => e.name === "mainnet");
    const web3 = new Web3(network.provider);
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
