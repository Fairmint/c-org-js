const abi = require("@fairmint/c-org-abi/abi.json");
const BigNumber = require("bignumber.js");
const constants = require("./constants");
const Web3 = require("web3");
const Proxy = require("./Proxy");

module.exports = class CorgContracts {
  /**
   * @param {object} web3 Expecting a web3 object or provider.
   * @param {string} address The DAT contract address.
   */
  constructor(web3, address) {
    this.web3 = new Web3(web3);
    this.dat = new this.web3.eth.Contract(abi.dat, address);
  }

  /**
   * @notice Call once after construction to pull data from the contract which can never change.
   */
  async init() {
    const [currencyAddress, whitelistAddress] = await Promise.all([
      this.dat.methods.currency().call(),
      this.dat.methods.whitelist().call(),
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
      abi.erc20.find((e) => e.name === "name").outputs[0].type = "string";
      abi.erc20.find((e) => e.name === "symbol").outputs[0].type = "string";
      [currencyName, currencySymbol] = await Promise.all([
        this.currency ? this.currency.methods.name().call() : "Ether",
        this.currency ? this.currency.methods.symbol().call() : "ETH",
      ]);
    } catch (e) {
      // Some tokens, such as DAI, return bytes32 instead of a string
      abi.erc20.find((e) => e.name === "name").outputs[0].type = "bytes32";
      abi.erc20.find((e) => e.name === "symbol").outputs[0].type = "bytes32";
      this.currency = new this.web3.eth.Contract(abi.erc20, currencyAddress);
      [currencyName, currencySymbol] = await Promise.all([
        this.currency.methods.name().call(),
        this.currency.methods.symbol().call(),
      ]);
      currencySymbol = this.web3.utils.hexToUtf8(currencySymbol);
      currencyName = this.web3.utils.hexToUtf8(currencyName);
    }

    const datProxy = new Proxy(this.web3, this.dat._address);
    const whitelistProxy = new Proxy(this.web3, this.whitelist._address);

    const [
      decimals,
      currencyDecimals,
      name,
      symbol,
      buySlopeNum,
      buySlopeDen,
      initGoal,
      initReserve,
      investmentReserve,
      proxyImplementation,
      proxyAdmin,
      whitelistProxyImplementation,
      whitelistProxyAdmin,
    ] = await Promise.all([
      this.dat.methods.decimals().call(),
      this.currency ? this.currency.methods.decimals().call() : 18,
      this.dat.methods.name().call(),
      this.dat.methods.symbol().call(),
      this.dat.methods.buySlopeNum().call(),
      this.dat.methods.buySlopeDen().call(),
      this.dat.methods.initGoal().call(),
      this.dat.methods.initReserve().call(),
      this.dat.methods.investmentReserveBasisPoints().call(),
      datProxy.implementation(),
      datProxy.admin(),
      whitelistProxy.implementation(),
      whitelistProxy.admin(),
    ]);

    this.data = {
      decimals: parseInt(decimals),
      currency: {
        decimals: parseInt(currencyDecimals),
        name: currencyName,
        symbol: currencySymbol,
      },
      name,
      symbol,
      version: "3", // reading version dynamically fails in the browser
      proxyImplementation,
      proxyAdmin,
      whitelistProxyAddress: this.whitelist._address,
      whitelistProxyImplementation,
      whitelistProxyAdmin,
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
      beneficiary,
      control,
      feeCollector,
      buybackReserve,
      fee,
      revenueCommitment,
      minInvestment,
      stateId,
      whitelistOwner,
      whitelistLockupGranularity,
      whitelistStartDate,
    ] = await Promise.all([
      this.dat.methods.totalSupply().call(),
      this.dat.methods.burnedSupply().call(),
      this.dat.methods.beneficiary().call(),
      this.dat.methods.control().call(),
      this.dat.methods.feeCollector().call(),
      this.dat.methods.buybackReserve().call(),
      this.dat.methods.feeBasisPoints().call(),
      this.dat.methods.revenueCommitmentBasisPoints().call(),
      this.dat.methods.minInvestment().call(),
      this.dat.methods.state().call(),
      this.whitelist.methods.owner().call(),
      this.whitelist.methods.lockupGranularity().call(),
      this.whitelist.methods.startDate().call(),
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
    this.data.beneficiary = beneficiary;
    this.data.control = control;
    this.data.feeCollector = feeCollector;
    this.data.buybackReserve = new BigNumber(buybackReserve).shiftedBy(
      -this.data.currency.decimals
    );
    this.data.fee = new BigNumber(fee).div(constants.BASIS_POINTS_DEN);
    this.data.minInvestment = new BigNumber(minInvestment).shiftedBy(
      -this.data.currency.decimals
    );
    this.data.state = constants.STATES[stateId];

    try {
      // minDuration was added in v3, older versions will fall into this catch
      this.data.minDuration = await this.dat.methods.minDuration().call();
    } catch (e) {
      console.log(`Missing minDuration (expected if version is < 3) ${e}`);
    }

    // mintPrice. The price of the last transaction. For the preview, we can
    // safely calculate it with (total_supply+burnt_supply-init_reserve)*buy_slope durning
    // RUN (or CLOSE).  price=init_goal*buy_slope/2 during INIT (or CANCEL)
    if (this.data.state === "INIT" || this.data.state === "CANCEL") {
      this.data.mintPrice = this.data.initGoal.times(this.data.buySlope).div(2);
    } else {
      this.data.mintPrice = this.data.totalSupply
        .plus(this.data.burnedSupply)
        .minus(this.data.initReserve)
        .times(this.data.buySlope);
    }

    // lastTokenPrice will include 2nd hand markets in the future as well
    // at first it's always == mintPrice
    this.data.lastTokenPrice = this.data.mintPrice;

    this.data.marketCap = this.data.totalSupply.times(this.data.mintPrice);

    if (this.data.state === "INIT") {
      this.data.redeemPrice = this.data.mintPrice;
    } else {
      // redeemPrice
      // (total_supply+burnt_supply)*sell_slope + (sell_slope*burnt_supply^2)/(2*total_supply).
      // with sell_slope=((2*buyback_reserve)/((total_supply+burnt_supply)^2)))
      // (b^2 r)/(t (b + t)^2) + (2 r)/(b + t)
      if (this.data.totalSupply.plus(this.data.burnedSupply).eq(0)) {
        this.data.redeemPrice = new BigNumber(0);
      } else {
        this.data.redeemPrice = this.data.burnedSupply
          .pow(2)
          .times(this.data.buybackReserve)
          .div(
            this.data.burnedSupply
              .plus(this.data.totalSupply)
              .pow(2)
              .times(this.data.totalSupply)
          )
          .plus(
            this.data.buybackReserve
              .times(2)
              .div(this.data.burnedSupply.plus(this.data.totalSupply))
          );
      }
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
    if (this.data.state === "RUN") {
      this.data.marketSentiment = this.data.buySlope
        .times(this.data.totalSupply)
        .times(this.data.burnedSupply.plus(this.data.totalSupply).pow(3))
        .div(
          this.data.buybackReserve.times(
            this.data.burnedSupply
              .pow(2)
              .plus(
                this.data.burnedSupply.times(2).times(this.data.totalSupply)
              )
              .plus(this.data.totalSupply.pow(2).times(2))
          )
        );
    } else {
      // This value should not be displayed unless in the RUN state
      this.data.marketSentiment = null;
    }

    // Whitelist data
    this.data.whitelist = {
      owner: whitelistOwner,
      lockupGranularity: whitelistLockupGranularity,
      startDate: whitelistStartDate,
    };
  }

  /**
   * @notice Call anytime to refresh account information.
   * @dev These values may change anytime the user has a transaction mined.
   */
  async refreshAccountInfo(accountAddress) {
    const account = { address: accountAddress };
    const [
      ethBalance,
      fairBalance,
      userId,
      currencyBalance,
      allowance,
    ] = await Promise.all([
      this.web3.eth.getBalance(accountAddress),
      this.dat.methods.balanceOf(accountAddress).call(),
      this.whitelist.methods.authorizedWalletToUserId(accountAddress).call(),
      this.currency
        ? this.currency.methods.balanceOf(accountAddress).call()
        : undefined,
      this.currency
        ? this.currency.methods
            .allowance(accountAddress, this.dat._address)
            .call()
        : undefined,
    ]);
    account.ethBalance = new BigNumber(ethBalance).shiftedBy(-18);
    account.fairBalance = new BigNumber(fairBalance).shiftedBy(
      -this.data.decimals
    );
    account.whitelist = {
      userId,
    };
    if (userId !== constants.ZERO_ADDRESS) {
      const {
        jurisdictionId,
        totalTokensLocked,
        startIndex,
        endIndex,
      } = await this.whitelist.methods.getAuthorizedUserIdInfo(userId).call();
      account.whitelist.jurisdictionId = jurisdictionId;
      account.whitelist.totalTokensLocked = totalTokensLocked;
      account.whitelist.startIndex = startIndex;
      account.whitelist.endIndex = endIndex;
    } else {
      account.whitelist.jurisdictionId = 0;
      account.whitelist.totalTokensLocked = 0;
      account.whitelist.startIndex = 0;
      account.whitelist.endIndex = 0;
    }

    if (currencyBalance) {
      account.currencyBalance = new BigNumber(currencyBalance).shiftedBy(
        -this.data.currency.decimals
      );
      account.allowance = new BigNumber(allowance).shiftedBy(
        -this.data.currency.decimals
      );
    }

    this.data.account = account;
  }

  /**
   * Returns the currency (or ETH) balance for a given address.
   * This call requires `init`.
   */
  async getCurrencyBalanceOf(accountAddress) {
    let balance;
    if (this.currency) {
      balance = await this.currency.methods.balanceOf(accountAddress).call();
      balance = new BigNumber(balance).shiftedBy(-this.data.currency.decimals);
    } else {
      balance = await this.web3.eth.getBalance(accountAddress);
      balance = new BigNumber(balance).shiftedBy(-18);
    }
    return balance;
  }

  /**
   * Returns the number of FAIR the holder has approved to spender to transfer.
   */
  async getFairAllowance(owner, spender) {
    return await this.dat.methods.allowance(owner, spender).call();
  }

  /**
   * Checks if the given address is approved as a whitelist operator.
   */
  async isWhitelistOperator(accountAddress) {
    return this.whitelist.methods.isOperator(accountAddress).call();
  }

  /**
   * Approves an account as a whitelist operator.
   * Must be called by the whitelist owner account.
   */
  addWhitelistOperator(accountAddress) {
    return this.whitelist.methods.addOperator(accountAddress);
  }

  /**
   * Calls `approve` on the currency for the dat to spend up to the specified value || unlimited if not specified.
   */
  approve(value) {
    return this.currency.methods.approve(
      this.dat._address,
      value ? value : constants.MAX_UINT
    );
  }
  /**
   * Calls `approve` on FAIR for the spender to spend up to the specified value || unlimited if not specified.
   */
  approveFair(spender, value) {
    return this.dat.methods.approve(
      spender,
      value ? value : constants.MAX_UINT
    );
  }
  approveNewUsers(accounts, jurisdictionIds) {
    return this.whitelist.methods.approveNewUsers(accounts, jurisdictionIds);
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
  async buy(currencyAmount, maxSlipPercent, sendToAddress) {
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

    return this.dat.methods.buy(
      sendTo,
      currencyValue.toFixed(),
      minBuyValue.toFixed()
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
  async sell(tokenAmount, maxSlipPercent, sendToAddress) {
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
    return this.dat.methods.sell(
      sendTo,
      tokenValue.toFixed(),
      minSellValue.toFixed()
    );
  }
  pay(currencyAmount) {
    currencyAmount = new BigNumber(currencyAmount);
    const currencyValue = currencyAmount
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    return this.dat.methods.pay(currencyValue.toFixed());
  }
  async estimateExitFee() {
    const exitFee = await this.dat.methods.estimateExitFee("0").call();
    return new BigNumber(exitFee).shiftedBy(-this.data.currency.decimals);
  }
  close() {
    return this.dat.methods.close();
  }
  burn(tokenAmount) {
    const tokenValue = new BigNumber(tokenAmount)
      .shiftedBy(this.data.decimals)
      .dp(0);
    return this.dat.methods.burn(tokenValue.toFixed());
  }
  burnFrom(from, tokenAmount) {
    const tokenValue = new BigNumber(tokenAmount)
      .shiftedBy(this.data.decimals)
      .dp(0);
    return this.dat.methods.burnFrom(from, tokenValue.toFixed());
  }
  /**
   *
   * @param spender address of the account which will be able to spend your tokens
   * @param value how many tokens the spender is approved to transfer
   * @param deadline the timestamp in seconds for when the signed message is valid until
   * @param nonce the owner's nonce, leave undefined to lookup the current nonce for that account
   */
  async signPermit(spender, value, deadline, nonce) {
    // Original source: https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26
    const domain = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ];
    const permit = [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ];
    let chainId = await this.web3.eth.net.getId();
    if (chainId >= 1337) {
      // Ganache uses chainId 1
      chainId = 1;
    }
    const domainData = {
      name: this.data.name,
      version: this.data.version,
      chainId,
      verifyingContract: this.dat._address,
    };
    const message = {
      owner: this.data.account.address,
      spender,
      value,
      nonce:
        nonce === undefined
          ? await this.dat.methods.nonces(this.data.account.address).call()
          : nonce,
      deadline,
    };
    const data = {
      types: {
        EIP712Domain: domain,
        Permit: permit,
      },
      domain: domainData,
      primaryType: "Permit",
      message,
    };
    return new Promise((resolve, reject) => {
      this.web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "eth_signTypedData",
          params: [this.data.account.address, data],
          from: this.data.account.address,
          id: new Date().getTime(),
        },
        (err, signature) => {
          if (err) {
            return reject(err);
          }
          return resolve(signature.result);
        }
      );
    });
  }
  async sendPermit(owner, spender, value, deadline, signature) {
    const signatureHash = signature.substring(2);
    const r = "0x" + signatureHash.substring(0, 64);
    const s = "0x" + signatureHash.substring(64, 128);
    const v = parseInt(signatureHash.substring(128, 130), 16);
    return this.dat.methods.permit(owner, spender, value, deadline, v, r, s);
  }

  /**
   *
   * @param sendToAddress address of the account which will receive FAIR from this purchase
   * @param currencyAmount how many tokens the spender is approved to spend
   * @param minTokensBought the minimum tokens expected from this purchase
   * @param deadline the timestamp in seconds for when the signed message is valid until
   * @param nonce the owner's nonce, leave undefined to lookup the current nonce for that account
   */
  async signPermitBuy(
    sendToAddress,
    currencyAmount,
    minTokensBought,
    deadline,
    nonce
  ) {
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const currencyValue = new BigNumber(currencyAmount)
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    let minBuyValue = new BigNumber(minTokensBought)
      .shiftedBy(this.data.decimals)
      .dp(0);
    if (minBuyValue.lt(1)) {
      minBuyValue = new BigNumber(1);
    }

    // Original source: https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26
    const domain = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ];
    const permitBuy = [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "currencyValue", type: "uint256" },
      { name: "minTokensBought", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ];
    let chainId = await this.web3.eth.net.getId();
    if (chainId >= 1337) {
      // Ganache uses chainId 1
      chainId = 1;
    }
    const domainData = {
      name: this.data.name,
      version: this.data.version,
      chainId,
      verifyingContract: this.dat._address,
    };
    const message = {
      from: this.data.account.address,
      to: sendTo,
      currencyValue: currencyValue.toFixed(),
      minTokensBought: minBuyValue.toFixed(),
      nonce:
        nonce === undefined
          ? await this.dat.methods.nonces(this.data.account.address).call()
          : nonce,
      deadline,
    };
    const data = {
      types: {
        EIP712Domain: domain,
        PermitBuy: permitBuy,
      },
      domain: domainData,
      primaryType: "PermitBuy",
      message,
    };
    return new Promise((resolve, reject) => {
      this.web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "eth_signTypedData",
          params: [this.data.account.address, data],
          from: this.data.account.address,
          id: new Date().getTime(),
        },
        (err, signature) => {
          if (err) {
            return reject(err);
          }
          return resolve(signature.result);
        }
      );
    });
  }
  async sendPermitBuy(
    from,
    sendToAddress,
    currencyAmount,
    minTokensBought,
    deadline,
    signature
  ) {
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = from;
    }
    const currencyValue = new BigNumber(currencyAmount)
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    let minBuyValue = new BigNumber(minTokensBought)
      .shiftedBy(this.data.decimals)
      .dp(0);
    if (minBuyValue.lt(1)) {
      minBuyValue = new BigNumber(1);
    }
    const signatureHash = signature.substring(2);
    const r = "0x" + signatureHash.substring(0, 64);
    const s = "0x" + signatureHash.substring(64, 128);
    const v = parseInt(signatureHash.substring(128, 130), 16);
    return this.dat.methods.permitBuy(
      from,
      sendTo,
      currencyValue.toFixed(),
      minBuyValue.toFixed(),
      deadline,
      v,
      r,
      s
    );
  }

  /**
   *
   * @param sendToAddress address of the account which will receive FAIR from this purchase
   * @param quantityToSell how many tokens to sell
   * @param minCurrencyReturned the minimum tokens expected from this purchase
   * @param deadline the timestamp in seconds for when the signed message is valid until
   * @param nonce the owner's nonce, leave undefined to lookup the current nonce for that account
   */
  async signPermitSell(
    sendToAddress,
    quantityToSell,
    minCurrencyReturned,
    deadline,
    nonce
  ) {
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const fairValue = new BigNumber(quantityToSell)
      .shiftedBy(this.data.decimals)
      .dp(0);
    let minCurrencyValue = new BigNumber(minCurrencyReturned)
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    if (minCurrencyValue.lt(1)) {
      minCurrencyValue = new BigNumber(1);
    }

    // Original source: https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26
    const domain = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ];
    const PermitSell = [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "quantityToSell", type: "uint256" },
      { name: "minCurrencyReturned", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ];
    let chainId = await this.web3.eth.net.getId();
    if (chainId >= 1337) {
      // Ganache uses chainId 1
      chainId = 1;
    }
    const domainData = {
      name: this.data.name,
      version: this.data.version,
      chainId,
      verifyingContract: this.dat._address,
    };
    const message = {
      from: this.data.account.address,
      to: sendTo,
      quantityToSell: fairValue.toFixed(),
      minCurrencyReturned: minCurrencyValue.toFixed(),
      nonce:
        nonce === undefined
          ? await this.dat.methods.nonces(this.data.account.address).call()
          : nonce,
      deadline: deadline,
    };
    const data = {
      types: {
        EIP712Domain: domain,
        PermitSell,
      },
      domain: domainData,
      primaryType: "PermitSell",
      message,
    };
    return new Promise((resolve, reject) => {
      this.web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "eth_signTypedData",
          params: [this.data.account.address, data],
          from: this.data.account.address,
          id: new Date().getTime(),
        },
        (err, signature) => {
          if (err) {
            return reject(err);
          }
          return resolve(signature.result);
        }
      );
    });
  }
  async sendPermitSell(
    from,
    sendToAddress,
    quantityToSell,
    minCurrencyReturned,
    deadline,
    signature
  ) {
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = from;
    }
    const fairValue = new BigNumber(quantityToSell)
      .shiftedBy(this.data.decimals)
      .dp(0);
    let minCurrencyValue = new BigNumber(minCurrencyReturned)
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    if (minCurrencyValue.lt(1)) {
      minCurrencyValue = new BigNumber(1);
    }
    const signatureHash = signature.substring(2);
    const r = "0x" + signatureHash.substring(0, 64);
    const s = "0x" + signatureHash.substring(64, 128);
    const v = parseInt(signatureHash.substring(128, 130), 16);
    return this.dat.methods.permitSell(
      from,
      sendTo,
      fairValue.toFixed(),
      minCurrencyValue.toFixed(),
      deadline,
      v,
      r,
      s
    );
  }
  configWhitelist(startDate, lockupGranularity) {
    return this.whitelist.methods.configWhitelist(startDate, lockupGranularity);
  }
  transferWhitelistOwnership(newOwner) {
    return this.whitelist.methods.transferOwnership(newOwner);
  }
};
