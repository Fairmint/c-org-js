const Web3 = require("web3");
const { tokens, protocols } = require("hardlydifficult-ethereum-contracts");
const { CorgContracts } = require("../index");

contract("daiToken", accounts => {
  let dai;
  let corg;

  beforeEach(async () => {
    // Deploy a DAI contract for testing
    dai = await tokens.dai.deploy(web3, accounts[0]);
    // Mint test tokens
    for (let i = 0; i < accounts.length - 1; i++) {
      await dai.mint(accounts[i], "1000000000000000000000000", {
        from: accounts[0]
      });
    }

    const contracts = await protocols.cOrg.deploy(web3, {
      initReserve: "42000000000000000000",
      currency: dai.address,
      initGoal: "0",
      buySlopeNum: "1",
      buySlopeDen: "100000000000000000000000000000000",
      investmentReserveBasisPoints: "1000",
      revenueCommitmentBasisPoints: "1000",
      feeBasisPoints: "0",
      autoBurn: false,
      minInvestment: "1",
      openUntilAtLeast: "0",
      name: "FAIR token",
      symbol: "FAIR",
      control: accounts[0]
    });

    corg = new CorgContracts(
      new Web3(web3.currentProvider),
      contracts.dat.address
    );
    await corg.init();
  });

  it("text reads as expected from the contract directly", async () => {
    assert.equal(await dai.symbol(), "DAI");
    assert.equal(await dai.name(), "");
  });

  it("text reads the same via c-org-js", async () => {
    assert.equal(corg.data.currency.symbol, await dai.symbol());
    assert.equal(corg.data.currency.name, await dai.name());
  });
});
