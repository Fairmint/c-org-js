const Web3 = require("web3");
const { tokens } = require("hardlydifficult-ethereum-contracts");
const { Corg, CorgContracts, constants } = require("..");

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

  it("Has the implementation address", async () => {
    assert.notEqual(corg.data.proxyImplementation, constants.ZERO_ADDRESS);
    assert(web3.utils.isAddress(corg.data.proxyImplementation));
  });

  it("Has the proxyAdmin address", async () => {
    assert.notEqual(corg.data.proxyAdmin, constants.ZERO_ADDRESS);
    assert(web3.utils.isAddress(corg.data.proxyAdmin));
  });

  it("Defaults to Infinity market sentiment", async () => {
    assert.equal(corg.data.marketSentiment.toFixed(), "Infinity");
  });

  it("has unknown jurisdictionId by default", async () => {
    await corg.refreshAccountInfo(accounts[3]);
    assert.equal(corg.data.account.whitelist.jurisdictionId, 0);
  });

  describe("once approved", () => {
    beforeEach(async () => {
      await corg.refreshAccountInfo(control); // switch to default operator account
      await corg.approveNewUsers([accounts[3]], [4]);
      await corg.refreshAccountInfo(accounts[3]); // switch to test account
      await corg.approve();
      await corg.buy("1", 100);
      await corg.refreshOrgInfo();
    });

    it("Has a mintPrice", async () => {
      assert(corg.data.mintPrice.gt(0));
    });

    it("Has a lastTokenPrice", async () => {
      assert(corg.data.lastTokenPrice.gt(0));
    });

    it("Has a redeemPrice", async () => {
      assert(corg.data.redeemPrice.gt(0));
    });

    it("Is version 2", async () => {
      assert.equal(corg.data.version, "2");
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

    it("has a jurisdictionId after", async () => {
      await corg.refreshAccountInfo(accounts[3]);
      assert.equal(corg.data.account.whitelist.jurisdictionId, 4);
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
