const Web3 = require("web3");
const { tokens, protocols } = require("hardlydifficult-ethereum-contracts");
const { CorgContracts } = require("../index");

contract("getPastEvents", accounts => {
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

    const contracts = await protocols.cOrg.deploy(web3, {
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
    corg = new CorgContracts(
      new Web3(web3.currentProvider),
      contracts.dat.address
    );
    await corg.init();
    await corg.refreshOrgInfo();
  });

  describe("once approved", () => {
    beforeEach(async () => {
      for (let i = 2; i < accounts.length; i++) {
        await corg.refreshAccountInfo(accounts[1]); // switch to control
        await corg.kyc(accounts[i]);
        await corg.refreshAccountInfo(accounts[i]); // switch to test account
        await corg.approve();
        await corg.buy("100", 100);
      }
      for (let i = 2; i <= 4; i++) {
        await corg.refreshAccountInfo(accounts[i]); // switch to test account
        await corg.sell(corg.data.account.balance, 100);
      }
    });

    it("getPastEvents", async () => {
      console.log(
        await corg.getPastEventsForAccount(corg.data.account.address)
      );
    });
  });
});
