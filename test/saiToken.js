const Web3 = require("web3");
const { constants, tokens } = require("hardlydifficult-eth");
const { CorgContracts } = require("../index");
const { Corg } = require("..");

contract("saiToken", (accounts) => {
  let sai;
  let corg;

  beforeEach(async () => {
    // Deploy a SAI contract for testing
    sai = await tokens.sai.deploy(web3, accounts[0]);
    // Mint test tokens
    for (let i = 0; i < accounts.length - 1; i++) {
      await sai.mint(accounts[i], "1000000000000000000000000", {
        from: accounts[0],
        gas: constants.MAX_GAS,
      });
    }

    const contracts = await Corg.deploy(web3, {
      initReserve: "42000000000000000000",
      currency: sai.address,
      initGoal: "0",
      buySlopeNum: "1",
      buySlopeDen: "100000000000000000000000000000000",
      investmentReserveBasisPoints: "1000",
      revenueCommitmentBasisPoints: "1000",
      feeBasisPoints: "0",
      minInvestment: "1",
      minDuration: "0",
      name: "FAIR token",
      symbol: "FAIR",
      control: accounts[0],
    });

    corg = new CorgContracts(
      new Web3(web3.currentProvider),
      contracts.dat.address
    );
    await corg.init();
  });

  it("text reads as expected from the contract directly", async () => {
    assert.equal(
      await sai.symbol(),
      "0x4441490000000000000000000000000000000000000000000000000000000000"
    );
    assert.equal(
      await sai.name(),
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("text reads as expected from c-org-js", async () => {
    assert.equal(corg.data.currency.symbol, "DAI");
    assert.equal(corg.data.currency.name, "");
  });
});
