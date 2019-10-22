const Web3 = require('web3');
const abi = require('@fairmint/c-org-abi/abi.json');
const BigNumber = require('bignumber.js');
const constants = require('./constants');

module.exports = class Corg {
  constructor(contracts) {
    this.contracts = contracts;
  }

  async sendTx (tx) {
    return new Promise((resolve) => {
      tx.send({
        from: this.data.account.address,
        gas: "500000", // todo estimate gas
        //gasPrice: contracts.web3.utils.toWei('1.1', 'Gwei'),
      })
        .on('transactionHash', (tx) => {
          resolve(tx);
        });
    })
  }

  async getContracts(contracts) {
      
        const [
          decimals,
          currencyDecimals,
          currencyName,
          currencySymbol,
          buySlopeNum,
          buySlopeDen,
          initGoal,
          initReserve,
          investmentReserve,
          revenueCommitment,
        ] = await Promise.all([
          contracts.dat.methods.decimals().call(),
          contracts.currency ? contracts.currency.methods.decimals().call() : 18,
          contracts.currency ? contracts.currency.methods.name().call() : 'Ether',
          contracts.currency ? contracts.currency.methods.symbol().call() : 'ETH',
          contracts.dat.methods.buySlopeNum().call(),
          contracts.dat.methods.buySlopeDen().call(),
          contracts.dat.methods.initGoal().call(),
          contracts.dat.methods.initReserve().call(),
          contracts.dat.methods.investmentReserveBasisPoints().call(),
          contracts.dat.methods.revenueCommitmentBasisPoints().call(),
        ]);

        this.data = {
          decimals: parseInt(decimals),
          currency: {
            decimals: parseInt(currencyDecimals),
            name: currencyName,
            symbol: currencySymbol,
          },
        };

        this.data.buySlope = new BigNumber(buySlopeNum).div(buySlopeDen),
        this.data.initGoal = new BigNumber(initGoal).shiftedBy(-this.data.decimals),
        this.data.initReserve = new BigNumber(initReserve).shiftedBy(-this.data.decimals),
        this.data.investmentReserve = new BigNumber(investmentReserve).div(constants.BASIS_POINTS_DEN),
        this.data.revenueCommitment = new BigNumber(revenueCommitment).div(constants.BASIS_POINTS_DEN);
  


      contracts.helpers = {
        refreshAccountInfo: async (account) => {
          this.data.account = { address: account };
          const [ethBalance, fairBalance, kycApproved, currencyBalance, allowance] = await Promise.all([
            contracts.web3.eth.getBalance(account),
            contracts.dat.methods.balanceOf(account).call(),
            contracts.whitelist.methods.approved(account).call(),
            contracts.currency ? contracts.currency.methods.balanceOf(account).call() : undefined,
            contracts.currency ? contracts.currency.methods.allowance(account, contracts.dat._address).call() : undefined,
          ]);
          this.data.account.ethBalance = new BigNumber(ethBalance).shiftedBy(-18);
          this.data.account.fairBalance = new BigNumber(fairBalance).shiftedBy(-this.data.decimals);
          this.data.account.kycApproved = kycApproved;
          if (currencyBalance) {
            this.data.account.currencyBalance = new BigNumber(currencyBalance).shiftedBy(-this.data.currency.decimals);
            this.data.account.allowance = new BigNumber(allowance).shiftedBy(-this.data.currency.decimals);
          }
        },
        refreshOrgInfo: async () => {
          const [
            totalSupply,
            burnedSupply,
            name,
            symbol,
            beneficiary,
            control,
            feeCollector,
            autoBurn,
            buybackReserve,
            fee,
            minInvestment,
            openUntilAtLeast,
            stateId,
          ] = await Promise.all([
            contracts.dat.methods.totalSupply().call(),
            contracts.dat.methods.burnedSupply().call(),
            contracts.dat.methods.name().call(),
            contracts.dat.methods.symbol().call(),
            contracts.dat.methods.beneficiary().call(),
            contracts.dat.methods.control().call(),
            contracts.dat.methods.feeCollector().call(),
            contracts.dat.methods.autoBurn().call(),
            contracts.dat.methods.buybackReserve().call(),
            contracts.dat.methods.feeBasisPoints().call(),
            contracts.dat.methods.minInvestment().call(),
            contracts.dat.methods.openUntilAtLeast().call(),
            contracts.dat.methods.state().call(),
          ]);

          this.data.totalSupply = new BigNumber(totalSupply).shiftedBy(-this.data.decimals);
          this.data.burnedSupply = new BigNumber(burnedSupply).shiftedBy(-this.data.decimals);
          this.data.name = name;
          this.data.symbol = symbol;
          this.data.beneficiary = beneficiary;
          this.data.control = control;
          this.data.feeCollector = feeCollector;
          this.data.autoBurn = autoBurn;
          this.data.buybackReserve = new BigNumber(buybackReserve).shiftedBy(-this.data.currency.decimals);
          this.data.fee = new BigNumber(fee).div(constants.BASIS_POINTS_DEN);
          this.data.minInvestment = new BigNumber(minInvestment).shiftedBy(-this.data.currency.decimals);
          this.data.openUntilAtLeast = openUntilAtLeast;
          this.data.state = constants.STATES[stateId];
        },
        approve: async () => {
          await sendTx(contracts.currency.methods.approve(contracts.dat._address, -1))
        },
        kyc: async (account, isApproved = true) => await sendTx(contracts.whitelist.methods.approve(account, isApproved)),
        estimateBuyValue: async (currencyAmount) => {
          if (!currencyAmount) return 0;
          const currencyValue = new BigNumber(currencyAmount).shiftedBy(this.data.currency.decimals);
          const buyValue = await contracts.dat.methods.estimateBuyValue(currencyValue.toFixed()).call();
          return new BigNumber(buyValue).shiftedBy(-this.data.decimals);
        },
        buy: async (currencyAmount, maxSlipPercent, sendToAddress = undefined) => {
          let sendTo;
          if (sendToAddress && sendToAddress !== contracts.web3.utils.padLeft(0, 40)) {
            sendTo = sendToAddress;
          } else {
            sendTo = this.data.account.address;
          }
          const estimateBuyValue = await contracts.helpers.estimateBuyValue(currencyAmount);
          if (!estimateBuyValue || estimateBuyValue.eq(0)) throw new Error('0 expected value');
          const currencyValue = new BigNumber(currencyAmount).shiftedBy(this.data.currency.decimals).dp(0);
          let minBuyValue = estimateBuyValue.times(new BigNumber(100).minus(maxSlipPercent).div(100)).shiftedBy(this.data.decimals).dp(0);
          if(minBuyValue.lt(1)) {
            minBuyValue = new BigNumber(1);
          }
          return await sendTx(contracts.dat.methods.buy(sendTo, currencyValue.toFixed(), minBuyValue.toFixed()));
        },
        estimateSellValue: async (tokenAmount) => {
          if (!tokenAmount) return 0;
          const tokenValue = new BigNumber(tokenAmount).shiftedBy(this.data.decimals);
          try {
            const sellValue = await contracts.dat.methods.estimateSellValue(tokenValue.toFixed()).call();
            return new BigNumber(sellValue).shiftedBy(-this.data.decimals);
          } catch (e) {
            // likely > totalSupply
            return new BigNumber(0);
          }
        },
        sell: async (tokenAmount, maxSlipPercent, sendToAddress = undefined) => {
          let sendTo;
          if (sendToAddress && sendToAddress !== contracts.web3.utils.padLeft(0, 40)) {
            sendTo = sendToAddress;
          } else {
            sendTo = this.data.account.address;
          }
          const estimateSellValue = await contracts.helpers.estimateSellValue(tokenAmount);
          if (!estimateSellValue || estimateSellValue.eq(0)) throw new Error('0 expected value');
          const tokenValue = new BigNumber(tokenAmount).shiftedBy(this.data.decimals).dp(0);
          let minSellValue = estimateSellValue.times(new BigNumber(100).minus(maxSlipPercent).div(100)).shiftedBy(this.data.decimals).dp(0);
          if(minSellValue.lt(1)) {
            minSellValue = new BigNumber(1);
          }
          return await sendTx(contracts.dat.methods.sell(sendTo, tokenValue.toFixed(), minSellValue.toFixed()));
        },
        estimatePayValue: async (currencyAmount) => {
          if (!currencyAmount) return 0;
          const currencyValue = new BigNumber(currencyAmount).shiftedBy(this.data.currency.decimals);
          const payValue = await contracts.dat.methods.estimatePayValue(currencyValue.toFixed()).call();
          return new BigNumber(payValue).shiftedBy(-this.data.decimals);
        },
        pay: async (currencyAmount, sendToAddress = undefined) => {
          let sendTo;
          if (sendToAddress && sendToAddress !== contracts.web3.utils.padLeft(0, 40)) {
            sendTo = sendToAddress;
          } else {
            sendTo = this.data.account.address;
          }
          const currencyValue = new BigNumber(currencyAmount).shiftedBy(this.data.currency.decimals).dp(0);
          return await sendTx(contracts.dat.methods.pay(sendTo, currencyValue.toFixed()));
        },
        burn: async (tokenAmount) => {
          const tokenValue = new BigNumber(tokenAmount).shiftedBy(this.data.decimals).dp(0);
          return await sendTx(contracts.dat.methods.burn(tokenValue.toFixed()));
        },
      };
    return contracts;
  }
}
