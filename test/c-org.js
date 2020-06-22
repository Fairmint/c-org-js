const { Corg } = require("..");
const truffleAssert = require("truffle-assertions");

contract("c-org", (accounts) => {
  const beneficiary = accounts[0];
  const control = accounts[1];
  const feeCollector = accounts[2];
  let contracts;

  before(async () => {
    contracts = await Corg.deploy(web3, {
      initReserve: "42000000000000000000",
      currency: web3.utils.padLeft(0, 40),
      initGoal: "0",
      buySlopeNum: "1",
      buySlopeDen: "100000000000000000000",
      investmentReserveBasisPoints: "1000",
      revenueCommitmentBasisPoints: "1000",
      feeBasisPoints: "0",
      burnThresholdBasisPoints: false,
      minInvestment: "1",
      minDuration: "0",
      name: "FAIR token",
      symbol: "FAIR",
      control,
      beneficiary,
      feeCollector,
    });
  });

  it("Buy should fail if not approved", async () => {
    await truffleAssert.fails(
      contracts.dat.buy(accounts[9], "10000000000000", 1, {
        from: accounts[9],
        value: "10000000000000",
      }),
      "revert"
    );
  });

  describe("once approved", async () => {
    before(async () => {
      await contracts.whitelist.approveNewUsers([accounts[9]], [4], {
        from: control,
      });
    });

    it("Can buy fair", async () => {
      await contracts.dat.buy(accounts[9], "10000000000000", 1, {
        from: accounts[9],
        value: "10000000000000",
      });

      const balance = await contracts.dat.balanceOf(accounts[9]);
      assert.equal(balance.toString(), "44721359549995793");
    });
  });
});
