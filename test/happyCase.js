const { tokens, protocols } = require('hardlydifficult-test-helpers');
const Corg = require('../index');
const truffleAssert = require('truffle-assertions');

contract('protocols / c-org', (accounts) => {
  const beneficiary = accounts[0];
  const control = accounts[1];
  const feeCollector = accounts[2];
  let cOrgLibrary;

  beforeEach(async () => {
    // Deploy a DAI contract for testing
    const dai = await tokens.dai.deploy(web3, accounts[0]);
    // Mint test tokens
    for(let i = 0; i < accounts.length; i++) {
      await dai.mint(accounts[i], "1000000000000000000000000", { from: accounts[0] });
    }

    const contracts = await protocols.cOrg.deploy(web3, {
      initReserve: '42000000000000000000',
      currency: dai.address,
      initGoal: '0',
      buySlopeNum: '1',
      buySlopeDen: '100000000000000000000',
      investmentReserveBasisPoints: '1000',
      revenueCommitementBasisPoints: '1000',
      feeBasisPoints: '0',
      burnThresholdBasisPoints: '0',
      minInvestment: '1',
      openUntilAtLeast: '0',
      name: 'FAIR token',
      symbol: 'FAIR',
      control,
      beneficiary,
      feeCollector
    });
    const corg = new Corg()
    cOrgLibrary = await corg.getContracts(web3, contracts.dat.address);
    await cOrgLibrary.helpers.refreshOrgInfo();
  });

  it('Defaults to 0 balance', async () => {
    await cOrgLibrary.helpers.refreshAccountInfo(accounts[9]);
    assert.equal(cOrgLibrary.data.account.fairBalance.toFixed(), '0');
  });

  describe('once approved', () => {
    beforeEach(async () => {
      await cOrgLibrary.helpers.refreshAccountInfo(accounts[1]); // switch to control
      await cOrgLibrary.helpers.kyc(accounts[9]);
      await cOrgLibrary.helpers.refreshAccountInfo(accounts[9]); // switch to test account
      await cOrgLibrary.helpers.approve();

      await cOrgLibrary.helpers.buy('1', 100);
    });

    it('Can buy fair', async () => {
      await cOrgLibrary.helpers.refreshAccountInfo(accounts[9]);
      assert.equal(cOrgLibrary.data.account.fairBalance.toFixed(), '2.3170396123');
    });
    
    describe('pay', () => {
      beforeEach(async () => {
        await cOrgLibrary.helpers.pay('1')
      })

      it('Can pay the contract', async () => {
        await cOrgLibrary.helpers.refreshAccountInfo(accounts[9]);
        assert.equal(cOrgLibrary.data.account.fairBalance.toFixed(), '2.5421149026');
      });
    })
    
    describe('burn after purchase', () => {
      beforeEach(async () => {
        await cOrgLibrary.helpers.burn('0.0000000001')
      })

      it('Can burn fair', async () => {
        await cOrgLibrary.helpers.refreshAccountInfo(accounts[9]);
        assert.equal(cOrgLibrary.data.account.fairBalance.toFixed(), '2.3170396122');
      });
    })
    
    describe('sell after purchase', () => {
      beforeEach(async () => {
        await cOrgLibrary.helpers.sell('1', 100)
      })

      it('Can sell fair', async () => {
        await cOrgLibrary.helpers.refreshAccountInfo(accounts[9]);
        assert.equal(cOrgLibrary.data.account.fairBalance.toFixed(), '1.3170396123');
      });
    })
  });
});
