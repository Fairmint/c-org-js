const abi = require("@fairmint/c-org-abi/abi.json");
const BigNumber = require("bignumber.js");
const constants = require("./constants");

function mergeDeDupe(arr) {
  // Flatten array of arrays of objects into an array of objects
  const data = [...new Set([].concat(...arr))];

  // De-dupe results
  const obj = {};
  for (const entry of data) {
    obj[JSON.stringify(entry)] = entry;
  }

  // And push back into an array
  const results = [];
  for (const key in obj) {
    results.push(obj[key]);
  }
  return results;
}

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

    let currencyName, currencySymbol;

    try {
      // This reverts the ABI just in case it was previously changed in memory
      abi.erc20.find(e => e.name === "name").outputs[0].type = "string";
      abi.erc20.find(e => e.name === "symbol").outputs[0].type = "string";
      [currencyName, currencySymbol] = await Promise.all([
        this.currency ? this.currency.methods.name().call() : "Ether",
        this.currency ? this.currency.methods.symbol().call() : "ETH"
      ]);
    } catch (e) {
      // Some tokens, such as DAI, return bytes32 instead of a string
      abi.erc20.find(e => e.name === "name").outputs[0].type = "bytes32";
      abi.erc20.find(e => e.name === "symbol").outputs[0].type = "bytes32";
      this.currency = new this.web3.eth.Contract(abi.erc20, currencyAddress);
      [currencyName, currencySymbol] = await Promise.all([
        this.currency.methods.name().call(),
        this.currency.methods.symbol().call()
      ]);
      currencySymbol = this.web3.utils.hexToUtf8(currencySymbol);
      currencyName = this.web3.utils.hexToUtf8(currencyName);
    }

    const [
      decimals,
      currencyDecimals,
      buySlopeNum,
      buySlopeDen,
      initGoal,
      initReserve,
      investmentReserve
    ] = await Promise.all([
      this.dat.methods.decimals().call(),
      this.currency ? this.currency.methods.decimals().call() : 18,
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

    this.data.buySlope = new BigNumber(buySlopeNum)
      .shiftedBy(18 + 18 - this.data.currency.decimals)
      .div(buySlopeDen);
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

    // Live FAIR price. The price of the last transaction. For the preview, we can
    // safely calculate it with (total_supply+burnt_supply)*buy_slope durning RUN (or CLOSE).
    // price=init_goal*buy_slope/2 during INIT (or CANCEL)
    if (this.data.state === "INIT" || this.data.state === "CANCEL") {
      this.data.liveFAIRPrice = this.data.initGoal
        .times(this.data.buySlope)
        .div(2);
    } else {
      this.data.liveFAIRPrice = this.data.totalSupply
        .plus(this.data.burnedSupply)
        .times(this.data.buySlope);
    }

    /**
     * Market sentiment
     * buyback_reserve = r
     * total_supply = t
     * burnt_supply = b
     * buy_slope = s
     *
     * source: ((t+b)*s)/((2*r/((t+b)^2))*(t+b)+((2*r/((t+b)^2))*b^2)/(2*t))
     * alternate: s t (b + t)^3 / (r (b^2 + 2 b t + 2 t^2))
     */
    this.data.marketSentiment = this.data.buySlope
      .times(this.data.totalSupply)
      .times(this.data.burnedSupply.plus(this.data.totalSupply).pow(3))
      .div(
        this.data.buybackReserve.times(
          this.data.burnedSupply
            .pow(2)
            .plus(this.data.burnedSupply.times(2).times(this.data.totalSupply))
            .plus(this.data.totalSupply.pow(2).times(2))
        )
      );
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
      return new BigNumber(sellValue).shiftedBy(-this.data.currency.decimals);
    } catch (e) {
      // likely > totalSupply
      return new BigNumber(0);
    }
  }
  async sell(tokenAmount, maxSlipPercent, sendToAddress = undefined) {
    tokenAmount = new BigNumber(tokenAmount);
    const estimateSellValue = await this.estimateSellValue(
      tokenAmount.toFixed()
    );
    if (!estimateSellValue || estimateSellValue.eq(0)) {
      throw new Error(
        `0 expected value from sell(${tokenAmount.toFixed()}, ${maxSlipPercent}, ${sendToAddress})`
      );
    }
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const tokenValue = tokenAmount.shiftedBy(this.data.decimals).dp(0);
    let minSellValue = estimateSellValue
      .times(new BigNumber(100).minus(maxSlipPercent).div(100))
      .shiftedBy(this.data.currency.decimals)
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
    currencyAmount = new BigNumber(currencyAmount);
    const currencyValue = currencyAmount.shiftedBy(this.data.currency.decimals);
    const payValue = await this.dat.methods
      .estimatePayValue(currencyValue.toFixed())
      .call();
    return new BigNumber(payValue).shiftedBy(-this.data.decimals);
  }
  async pay(currencyAmount, sendToAddress = undefined) {
    currencyAmount = new BigNumber(currencyAmount);
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const currencyValue = currencyAmount
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

  /**
   * Gets all events involving the given account.
   * Events: Approval owner/spender, Transfer from/to, Buy from/to, Sell from/to, and/or Pay from/to
   */
  async getPastEventsForAccount(account) {
    const promises = [
      this.dat.getPastEvents("Transfer", {
        filter: {
          _to: account
        }
      }),
      this.dat.getPastEvents("Transfer", {
        filter: {
          _from: account
        }
      }),
      this.dat.getPastEvents("Approval", {
        filter: {
          _owner: account
        }
      }),
      this.dat.getPastEvents("Approval", {
        filter: {
          _spender: account
        }
      }),
      this.dat.getPastEvents("Buy", {
        filter: {
          _from: account
        }
      }),
      this.dat.getPastEvents("Buy", {
        filter: {
          _to: account
        }
      }),
      this.dat.getPastEvents("Sell", {
        filter: {
          _from: account
        }
      }),
      this.dat.getPastEvents("Sell", {
        filter: {
          _to: account
        }
      }),
      this.dat.getPastEvents("Pay", {
        filter: {
          _from: account
        }
      }),
      this.dat.getPastEvents("Pay", {
        filter: {
          _to: account
        }
      })
    ];

    if (this.currency) {
      promises.push(
        this.currency.getPastEvents("Transfer", { filter: { from: account } }),
        this.currency.getPastEvents("Transfer", { filter: { to: account } }),
        this.currency.getPastEvents("Approval", {
          filter: { owner: account }
        }),
        this.currency.getPastEvents("Approval", {
          filter: { spender: account }
        })
      );
    }

    return mergeDeDupe(await Promise.all(promises));
  }
};
