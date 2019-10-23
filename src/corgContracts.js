const abi = require("@fairmint/c-org-abi/abi.json");
const BigNumber = require("bignumber.js");
const constants = require("./constants");

module.exports = class CorgContracts {
  /**
   * @param {object} web3 Expecting a web3 1.0 object.
   * @param {string} address The DAT contract address.
   * @param {object} metadata An object with any additional info such as networkName.
   */
  constructor(web3, address, metadata) {
    this.web3 = web3;
    this.dat = new this.web3.eth.Contract(abi.dat, address);
    this.metadata = metadata;
  }

  async _sendTx(tx) {
    return new Promise(resolve => {
      tx.send({
        from: this.data.account.address,
        gas: "500000", // todo estimate gas
        gasPrice: this.web3.utils.toWei("1.1", "Gwei")
      }).on("transactionHash", tx => {
        resolve(tx);
      });
    });
  }

  /**
   * @notice Call once after construction to pull data from the contract which can never change.
   */
  async init() {
    const [currencyAddress, whitelistAddress] = await Promise.all([
      this.dat.methods.currencyAddress().call(),
      this.dat.methods.whitelistAddress().call()
    ]);
    this.currency =
      currencyAddress && currencyAddress !== this.web3.utils.padLeft(0, 40)
        ? new this.web3.eth.Contract(abi.erc20, currencyAddress)
        : null;
    this.whitelist = new this.web3.eth.Contract(
      abi.whitelist,
      whitelistAddress
    );

    const [
      decimals,
      currencyDecimals,
      currencyName,
      currencySymbol,
      buySlopeNum,
      buySlopeDen,
      initGoal,
      initReserve,
      investmentReserve
    ] = await Promise.all([
      this.dat.methods.decimals().call(),
      this.currency ? this.currency.methods.decimals().call() : 18,
      this.currency ? this.currency.methods.name().call() : "Ether",
      this.currency ? this.currency.methods.symbol().call() : "ETH",
      this.dat.methods.buySlopeNum().call(),
      this.dat.methods.buySlopeDen().call(),
      this.dat.methods.initGoal().call(),
      this.dat.methods.initReserve().call(),
      this.dat.methods.investmentReserveBasisPoints().call()
    ]);

    this.data = {
      decimals: parseInt(decimals),
      currency: {
        decimals: parseInt(currencyDecimals),
        name: currencyName,
        symbol: currencySymbol
      }
    };

    this.data.buySlope = new BigNumber(buySlopeNum).div(buySlopeDen);
    this.data.initGoal = new BigNumber(initGoal).shiftedBy(-this.data.decimals);
    this.data.initReserve = new BigNumber(initReserve).shiftedBy(
      -this.data.decimals
    );
    this.data.investmentReserve = new BigNumber(investmentReserve).div(
      constants.BASIS_POINTS_DEN
    );
  }

  /**
   * @notice Call anytime to refresh information about the org.
   * @dev These values may change anytime any user has a transaction mined.
   */
  async refreshOrgInfo() {
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
      revenueCommitment,
      minInvestment,
      openUntilAtLeast,
      stateId
    ] = await Promise.all([
      this.dat.methods.totalSupply().call(),
      this.dat.methods.burnedSupply().call(),
      this.dat.methods.name().call(),
      this.dat.methods.symbol().call(),
      this.dat.methods.beneficiary().call(),
      this.dat.methods.control().call(),
      this.dat.methods.feeCollector().call(),
      this.dat.methods.autoBurn().call(),
      this.dat.methods.buybackReserve().call(),
      this.dat.methods.feeBasisPoints().call(),
      this.dat.methods.revenueCommitmentBasisPoints().call(),
      this.dat.methods.minInvestment().call(),
      this.dat.methods.openUntilAtLeast().call(),
      this.dat.methods.state().call()
    ]);

    this.data.revenueCommitment = new BigNumber(revenueCommitment).div(
      constants.BASIS_POINTS_DEN
    );
    this.data.totalSupply = new BigNumber(totalSupply).shiftedBy(
      -this.data.decimals
    );
    this.data.burnedSupply = new BigNumber(burnedSupply).shiftedBy(
      -this.data.decimals
    );
    this.data.name = name;
    this.data.symbol = symbol;
    this.data.beneficiary = beneficiary;
    this.data.control = control;
    this.data.feeCollector = feeCollector;
    this.data.autoBurn = autoBurn;
    this.data.buybackReserve = new BigNumber(buybackReserve).shiftedBy(
      -this.data.currency.decimals
    );
    this.data.fee = new BigNumber(fee).div(constants.BASIS_POINTS_DEN);
    this.data.minInvestment = new BigNumber(minInvestment).shiftedBy(
      -this.data.currency.decimals
    );
    this.data.openUntilAtLeast = openUntilAtLeast;
    this.data.state = constants.STATES[stateId];
  }

  /**
   * @notice Call anytime to refresh account information.
   * @dev These values may change anytime the user has a transaction mined.
   */
  async refreshAccountInfo(accountAddress) {
    this.data.account = { address: accountAddress };
    const [
      ethBalance,
      fairBalance,
      kycApproved,
      currencyBalance,
      allowance
    ] = await Promise.all([
      this.web3.eth.getBalance(accountAddress),
      this.dat.methods.balanceOf(accountAddress).call(),
      this.whitelist.methods.approved(accountAddress).call(),
      this.currency
        ? this.currency.methods.balanceOf(accountAddress).call()
        : undefined,
      this.currency
        ? this.currency.methods
            .allowance(accountAddress, this.dat._address)
            .call()
        : undefined
    ]);
    this.data.account.ethBalance = new BigNumber(ethBalance).shiftedBy(-18);
    this.data.account.fairBalance = new BigNumber(fairBalance).shiftedBy(
      -this.data.decimals
    );
    this.data.account.kycApproved = kycApproved;
    if (currencyBalance) {
      this.data.account.currencyBalance = new BigNumber(
        currencyBalance
      ).shiftedBy(-this.data.currency.decimals);
      this.data.account.allowance = new BigNumber(allowance).shiftedBy(
        -this.data.currency.decimals
      );
    }
  }

  async approve() {
    await this._sendTx(this.currency.methods.approve(this.dat._address, -1));
  }
  async kyc(account, isApproved = true) {
    await this._sendTx(this.whitelist.methods.approve(account, isApproved));
  }
  async estimateBuyValue(currencyAmount) {
    if (!currencyAmount) return 0;
    const currencyValue = new BigNumber(currencyAmount).shiftedBy(
      this.data.currency.decimals
    );
    const buyValue = await this.dat.methods
      .estimateBuyValue(currencyValue.toFixed())
      .call();
    return new BigNumber(buyValue).shiftedBy(-this.data.decimals);
  }
  async buy(currencyAmount, maxSlipPercent, sendToAddress = undefined) {
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const estimateBuyValue = await this.estimateBuyValue(currencyAmount);
    if (!estimateBuyValue || estimateBuyValue.eq(0))
      throw new Error("0 expected value");
    const currencyValue = new BigNumber(currencyAmount)
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    let minBuyValue = estimateBuyValue
      .times(new BigNumber(100).minus(maxSlipPercent).div(100))
      .shiftedBy(this.data.decimals)
      .dp(0);
    if (minBuyValue.lt(1)) {
      minBuyValue = new BigNumber(1);
    }
    return await this._sendTx(
      this.dat.methods.buy(
        sendTo,
        currencyValue.toFixed(),
        minBuyValue.toFixed()
      )
    );
  }
  async estimateSellValue(tokenAmount) {
    if (!tokenAmount) return 0;
    const tokenValue = new BigNumber(tokenAmount).shiftedBy(this.data.decimals);
    try {
      const sellValue = await this.dat.methods
        .estimateSellValue(tokenValue.toFixed())
        .call();
      return new BigNumber(sellValue).shiftedBy(-this.data.decimals);
    } catch (e) {
      // likely > totalSupply
      return new BigNumber(0);
    }
  }
  async sell(tokenAmount, maxSlipPercent, sendToAddress = undefined) {
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const estimateSellValue = await this.estimateSellValue(tokenAmount);
    if (!estimateSellValue || estimateSellValue.eq(0))
      throw new Error("0 expected value");
    const tokenValue = new BigNumber(tokenAmount)
      .shiftedBy(this.data.decimals)
      .dp(0);
    let minSellValue = estimateSellValue
      .times(new BigNumber(100).minus(maxSlipPercent).div(100))
      .shiftedBy(this.data.decimals)
      .dp(0);
    if (minSellValue.lt(1)) {
      minSellValue = new BigNumber(1);
    }
    return await this._sendTx(
      this.dat.methods.sell(
        sendTo,
        tokenValue.toFixed(),
        minSellValue.toFixed()
      )
    );
  }
  async estimatePayValue(currencyAmount) {
    if (!currencyAmount) return 0;
    const currencyValue = new BigNumber(currencyAmount).shiftedBy(
      this.data.currency.decimals
    );
    const payValue = await this.dat.methods
      .estimatePayValue(currencyValue.toFixed())
      .call();
    return new BigNumber(payValue).shiftedBy(-this.data.decimals);
  }
  async pay(currencyAmount, sendToAddress = undefined) {
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const currencyValue = new BigNumber(currencyAmount)
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    return await this._sendTx(
      this.dat.methods.pay(sendTo, currencyValue.toFixed())
    );
  }
  async burn(tokenAmount) {
    const tokenValue = new BigNumber(tokenAmount)
      .shiftedBy(this.data.decimals)
      .dp(0);
    return await this._sendTx(this.dat.methods.burn(tokenValue.toFixed()));
  }
};
