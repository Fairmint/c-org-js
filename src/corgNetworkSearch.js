const Web3 = require("web3");
const abi = require("@fairmint/c-org-abi/abi.json");
const CorgContracts = require("./corgContracts");

async function _isNativeANetworkMatch(network, nativeWeb3) {
  let isNativeANetworkMatch = false;
  let web3 = new Web3(network.provider);
  try {
    const [networkId, newNetworkId] = await Promise.all([
      nativeWeb3.eth.net.getId(),
      web3.eth.net.getId()
    ]);

    if (networkId.toString() === newNetworkId.toString()) {
      web3 = nativeWeb3;
      isNativeANetworkMatch = true;
    }
  } catch (e) {
    // ignore
  }

  return isNativeANetworkMatch;
}

async function _getContractsFrom(network, nativeWeb3, address) {
  try {
    const isNetworkMatch = await _isNativeANetworkMatch(network, nativeWeb3);
    let web3;
    if (isNetworkMatch) {
      web3 = new Web3(nativeWeb3.provider);
    } else {
      web3 = new Web3(network.provider);
    }
    const datContract = new web3.eth.Contract(abi.dat, address);

    // This call is just a probe to check if this is potentially a valid DAT contract
    await datContract.methods.currencyAddress().call();

    return new CorgContracts(web3, address, {
      isNetworkMatch,
      networkName: network.name
    });
  } catch (e) {
    // ignore
  }
}

/**
 * @notice Checks each supported network and returns the first which contains a
 * DAT contract at the target address.
 * @dev it is possible to have contracts on different networks with the same address.
 */
module.exports = class CorgNetworkSearch {
  /**
   * @param {Array} networks An array of supported networks to check.
   * Each entry should contain `{ name, provider }`.
   */
  constructor(networks) {
    if (networks.length < 2) throw new Error("Use CorgContract instead");

    this.networks = networks;
  }

  /**
   * @notice Returns CorgContracts for the first supported network (or null if not found).
   * @param {object} web3Provider The web3 provider in use locally, typically `web3.currentProvider`.
   * @param {string} address The contract address to load.
   */
  async getContracts(web3Provider, address) {
    const web3 = new Web3(web3Provider);

    const promises = [];
    for (const network of this.networks) {
      promises.push(_getContractsFrom(network, web3, address));
    }
    const results = await Promise.all(promises);
    for (const result of results) {
      if (result) {
        return result;
      }
    }

    return undefined; // address not found on any supported network
  }
};
