const { tokens } = require("hardlydifficult-ethereum-contracts");
const { CorgNetworkSearch, Networks } = require("../index");
const { Corg } = require("..");

contract("corgNetworkSearch", accounts => {
  const beneficiary = accounts[0];
  const control = accounts[1];
  const feeCollector = accounts[2];
  let corg;

  beforeEach(async () => {
    // Deploy a USDC contract for testing
    const usdc = await tokens.usdc.deploy(
      web3,
      accounts[accounts.length - 1],
      accounts[0]
    );
    // Mint test tokens
    for (let i = 0; i < accounts.length - 1; i++) {
      await usdc.mint(accounts[i], "1000000000000000000000000", {
        from: accounts[0]
      });
    }

    const contracts = await Corg.deploy(web3, {
      initReserve: "42000000000000000000",
      currency: usdc.address,
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
      control,
      beneficiary,
      feeCollector
    });
    const networkSearch = new CorgNetworkSearch(Networks);
    corg = await networkSearch.getContracts(
      web3.currentProvider,
      contracts.dat.address
    );
    await corg.init();
    await corg.refreshOrgInfo();
  });

  it("Defaults to 0 balance", async () => {
    await corg.refreshAccountInfo(accounts[3]);
    assert.equal(corg.data.account.fairBalance.toFixed(), "0");
  });
});
