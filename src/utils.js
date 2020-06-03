module.exports = {
  getAccountNonce: async function (accountAddress) {
    return await web3.eth.getTransactionCount(accountAddress, "pending");
  },
};
