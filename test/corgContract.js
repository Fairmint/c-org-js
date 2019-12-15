const Web3 = require("web3");
const { tokens } = require("hardlydifficult-ethereum-contracts");
const { Corg } = require("..");
const { CorgContracts } = require("../index");

contract("corgContract", accounts => {
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
    corg = new CorgContracts(
      new Web3(web3.currentProvider),
      contracts.dat.address
    );
    await corg.init();
    await corg.refreshOrgInfo();
  });

  it("Defaults to 0 balance", async () => {
    await corg.refreshAccountInfo(accounts[3]);
    assert.equal(corg.data.account.fairBalance.toFixed(), "0");
  });

  it("Defaults to Infinity market sentiment", async () => {
    assert.equal(corg.data.marketSentiment.toFixed(), "Infinity");
  });

  describe("once approved", () => {
    beforeEach(async () => {
      await corg.refreshAccountInfo(accounts[1]); // switch to control
      await corg.kyc(accounts[3]);
      await corg.refreshAccountInfo(accounts[3]); // switch to test account
      await corg.approve();

      await corg.buy("1", 100);
    });

    it("Can buy fair", async () => {
      await corg.refreshAccountInfo(accounts[3]);
      assert.equal(
        corg.data.account.fairBalance.toFixed(),
        "14.142135623730950488"
      );
    });

    it("Now has a valid market sentiment", async () => {
      await corg.refreshOrgInfo();
      assert.notEqual(corg.data.marketSentiment.toFixed(), "Infinity");
    });

    describe("pay", () => {
      beforeEach(async () => {
        await corg.pay("1");
      });

      it("Can pay the contract", async () => {
        await corg.refreshAccountInfo(accounts[3]);
        assert.equal(
          corg.data.account.fairBalance.toFixed(),
          "14.31997329894075723"
        );
      });
    });

    describe("burn after purchase", () => {
      beforeEach(async () => {
        await corg.burn("0.1");
      });

      it("Can burn fair", async () => {
        await corg.refreshAccountInfo(accounts[3]);
        assert.equal(
          corg.data.account.fairBalance.toFixed(),
          "14.042135623730950488"
        );
      });
    });

    describe("sell after purchase", () => {
      beforeEach(async () => {
        await corg.sell("1", 100);
      });

      it("Can sell fair", async () => {
        await corg.refreshAccountInfo(accounts[3]);
        assert.equal(
          corg.data.account.fairBalance.toFixed(),
          "13.142135623730950488"
        );
      });
    });
  });
});
