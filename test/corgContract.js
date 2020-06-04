const Web3 = require("web3");
const BigNumber = require("bignumber.js");
const { tokens } = require("hardlydifficult-eth");
const { Corg, CorgContracts, constants } = require("..");

contract("corgContract", (accounts) => {
  const beneficiary = accounts[0];
  const control = accounts[1];
  const feeCollector = accounts[2];
  let corg, usdc;

  beforeEach(async () => {
    // Deploy a USDC contract for testing
    usdc = await tokens.usdc.deploy(
      web3,
      accounts[accounts.length - 1],
      accounts[0]
    );
    // Mint test tokens
    for (let i = 0; i < accounts.length - 1; i++) {
      await usdc.mint(accounts[i], "1000000000000000000000000", {
        from: accounts[0],
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
      feeCollector,
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

  it("can read balance of", async () => {
    const account = accounts[3];
    let expected = await usdc.balanceOf(account);
    expected = new BigNumber(expected).shiftedBy(
      -1 * parseInt(await usdc.decimals())
    );
    const actual = await corg.getCurrencyBalanceOf(account);
    assert.equal(actual.toString(), expected.toString());
  });

  describe("whitelist", () => {
    const operatorAccount = accounts[3];

    it("has an owner", async () => {
      const expected = await corg.whitelist.methods.owner().call();
      assert.equal(corg.data.whitelist.owner, expected);
    });

    it("has a default startDate", async () => {
      assert.equal(corg.data.whitelist.startDate.toString(), "0");
    });

    it("has a default lockupGranularity", async () => {
      assert.equal(corg.data.whitelist.lockupGranularity.toString(), "0");
    });

    it("is not an operator by default", async () => {
      const actual = await corg.isWhitelistOperator(operatorAccount);
      assert.equal(actual, false);
    });

    describe("update whitelist", () => {
      const newStartDate = 42;
      const newLockupGranularity = 99;

      beforeEach(async () => {
        await corg.configWhitelist(newStartDate, newLockupGranularity, {
          from: corg.data.whitelist.owner,
        });
        await corg.refreshOrgInfo();
      });

      it("has new startDate", async () => {
        assert.equal(corg.data.whitelist.startDate.toString(), newStartDate);
      });

      it("has new lockupGranularity", async () => {
        assert.equal(
          corg.data.whitelist.lockupGranularity.toString(),
          newLockupGranularity
        );
      });
    });

    describe("change owner", () => {
      const newOwner = accounts[9];

      beforeEach(async () => {
        await corg.transferWhitelistOwnership(newOwner, {
          from: corg.data.whitelist.owner,
        });
        await corg.refreshOrgInfo();
      });

      it("has the new owner", async () => {
        assert.equal(corg.data.whitelist.owner, newOwner);
      });
    });

    describe("add operator", () => {
      beforeEach(async () => {
        await corg.addWhitelistOperator(operatorAccount, {
          from: corg.data.whitelist.owner,
        });
      });

      it("is now an operator", async () => {
        const actual = await corg.isWhitelistOperator(operatorAccount);
        assert.equal(actual, true);
      });
    });
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

    it("Can specify custom call options", async () => {
      const gasPrice = web3.utils.toWei("4", "gwei");
      const txHash = await corg.buy("1", 100, undefined, {
        gasPrice,
      });
      const tx = await web3.eth.getTransaction(txHash);
      assert.equal(tx.gasPrice, gasPrice);
    });

    it("Can specify a custom nonce", async () => {
      let error;
      try {
        await corg.buy("1", 100, undefined, {
          nonce: 42,
        });
      } catch (err) {
        error = err;
      }
      assert(
        error.message.includes(
          "Returned error: the tx doesn't have the correct nonce. account has nonce of:"
        )
      );
    });

    it("Has a mintPrice", async () => {
      assert(corg.data.mintPrice.gt(0));
    });

    it("Has a lastTokenPrice", async () => {
      assert(corg.data.lastTokenPrice.gt(0));
    });

    it("Has a marketCap", async () => {
      assert(corg.data.marketCap.gt(0));
      assert.equal(
        corg.data.marketCap.toFixed(),
        corg.data.totalSupply.times(corg.data.mintPrice).toFixed()
      );
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
