const Web3 = require("web3");
const { tokens } = require("hardlydifficult-ethereum-contracts");
const { CorgContracts } = require("../index");
const { Corg } = require("..");

contract("usdcToken", accounts => {
  let usdc;
  let corg;

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
      control: accounts[0]
    });

    corg = new CorgContracts(
      new Web3(web3.currentProvider),
      contracts.dat.address
    );
    await corg.init();
  });

  it("text reads as expected from the contract directly", async () => {
    assert.equal(await usdc.symbol(), "USDC");
    assert.equal(await usdc.name(), "USD//C");
  });

  it("text reads the same via c-org-js", async () => {
    assert.equal(corg.data.currency.symbol, await usdc.symbol());
    assert.equal(corg.data.currency.name, await usdc.name());
  });
});
