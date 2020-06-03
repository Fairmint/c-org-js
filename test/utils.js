const { utils } = require("..");

contract("utils", (accounts) => {
  it("Can read an accounts nonce", async () => {
    const originalNonce = await utils.getAccountNonce(accounts[0]);
    await web3.eth.sendTransaction({ to: accounts[2], from: accounts[0] });
    const newNonce = await utils.getAccountNonce(accounts[0]);
    assert.equal(newNonce, originalNonce + 1);
  });
});
