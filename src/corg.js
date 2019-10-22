const Web3 = require('web3');
const abi = require('@fairmint/c-org-abi/abi.json');
const BigNumber = require('bignumber.js');
const constants = require('./constants');
const CorgContracts = require('./corgContracts');

module.exports = class Corg {
  constructor(networks) {
    this.networks = networks;
  }

  async _getContractsFrom(network, nativeWeb3, address) {
    try {
      let isNetworkMatch = false;
      let web3 = new Web3(this.networks[network].provider);
      try {
        const [networkId, newNetworkId] = await Promise.all([
          nativeWeb3.eth.net.getId(),
          web3.eth.net.getId(),
        ]);

        if (networkId.toString() === newNetworkId.toString()) {
          web3 = nativeWeb3;
          isNetworkMatch = true;
        }
      } catch (e) {
        // ignore
      }
      const networkName = this.networks[network].name;

      const datContract = new web3.eth.Contract(abi.dat, address);
      const currencyAddress = await datContract.methods.currencyAddress().call()
      const currency = currencyAddress && currencyAddress !== web3.utils.padLeft(0, 40) 
        ? new web3.eth.Contract(abi.erc20, currencyAddress) : null;
      const whitelist = new web3.eth.Contract(abi.whitelist, await datContract.methods.whitelistAddress().call());
      return {
          web3, isNetworkMatch, networkName, dat: datContract, currency, whitelist,
        };
      } catch (e) {
        // ignore
      }
  }

  async _getContracts(nativeWeb3, address) {
    const promises = [];
    for (const network in this.networks) {
      promises.push(this._getContractsFrom(network, nativeWeb3, address));
    }
    const results = await Promise.all(promises);
    for (const result of results) {
      if (result) {
        return result;
      }
    }

    return undefined; // address not found on any supported network
  }

  async getContracts(anyWeb3, address) {
    const web3 = new Web3(anyWeb3.currentProvider);
    const contracts = await this._getContracts(web3, address);
    return new CorgContracts(contracts);
  }
}
