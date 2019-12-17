const cOrgAbi = require("@fairmint/c-org-abi/abi.json");
const cOrgBytecode = require("@fairmint/c-org-abi/bytecode.json");
const { helpers } = require("hardlydifficult-ethereum-contracts");

async function getDat(web3, datAddress) {
  return await helpers.truffleContract.at(web3, cOrgAbi.dat, datAddress);
}

async function getWhitelist(web3, whitelistAddress) {
  return await helpers.truffleContract.at(
    web3,
    cOrgAbi.whitelist,
    whitelistAddress
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDeploy(tx) {
  const hash = await tx;
  let receipt;
  do {
    await sleep(1500);
    receipt = await web3.eth.getTransactionReceipt(hash);
  } while (receipt === null);
  return receipt.contractAddress;
}

function deployContract(web3, from, abi, options) {
  return new Promise((resolve, reject) => {
    const txObj = new web3.eth.Contract(abi).deploy(options);
    return txObj.estimateGas().then(gas => {
      return txObj
        .send({
          from,
          gas
        })
        .on("transactionHash", tx => {
          return resolve(tx);
        })
        .on("error", error => {
          return reject(error);
        });
    });
  });
}

function deployDatTemplate(web3, from) {
  return deployContract(web3, from, cOrgAbi.dat, { data: cOrgBytecode.dat });
}
function deployWhitelistTemplate(web3, from) {
  return deployContract(web3, from, cOrgAbi.whitelist, {
    data: cOrgBytecode.whitelist
  });
}
function deployProxyAdmin(web3, from) {
  return deployContract(web3, from, cOrgAbi.proxyAdmin, {
    data: cOrgBytecode.proxyAdmin
  });
}
function deployProxy(web3, from, templateAddress, adminAddress) {
  return deployContract(web3, from, cOrgAbi.proxy, {
    data: cOrgBytecode.proxy,
    arguments: [templateAddress, adminAddress, "0x"]
  });
}

module.exports = {
  deployDatTemplate,
  deployWhitelistTemplate,
  deployProxyAdmin,
  deployProxy,
  deploy: async (web3, options) => {
    // Once per network:
    // 1) deploy dat template
    //   - enter address
    // 2) deploy whitelist template
    //   - enter address

    // Once per dat:
    // 3) deploy proxy admin
    //   - enter address
    // 4) deploy dat proxy(datTemplate.address, proxyAdmin.address)
    //   - enter address
    // 5) deploy whitelist proxy(whitelistTemplate.address, proxyAdmin.address)
    //   - enter address
    // 6) whitelistProxy.initialize(datProxy.address)
    //   - display: initialized
    // 7) datProxy.initialize(datFixedSettings)
    //   - display: initialized
    // 8-11) whitelist.approve(dat, control, beneficiary, feeCollector)
    // 12) datProxy.updateConfig(whitelistProxy.address, datUpdatableSettings)
    //   - no change (just display all settings)
    //   - include new control account address
    // 13) whitelistProxy.transferOwnership(new control address)
    //   - no change (just display all settings)
    // 14) proxyAdmin.transferOwnership(new control address)
    //   - no change (just display all settings)

    const callOptions = Object.assign(
      {
        initReserve: "42000000000000000000",
        currency: "0x0000000000000000000000000000000000000000",
        initGoal: "0",
        buySlopeNum: "1",
        buySlopeDen: "100000000000000000000",
        investmentReserveBasisPoints: "1000",
        revenueCommitmentBasisPoints: "1000",
        feeBasisPoints: "0",
        burnThresholdBasisPoints: false,
        minInvestment: "1",
        openUntilAtLeast: "0",
        name: "FAIR token",
        symbol: "FAIR",
        beneficiary: options.control,
        feeCollector: options.control
      },
      options
    );

    const datTemplateAddress = await waitForDeploy(
      deployDatTemplate(web3, callOptions.control)
    );
    const whitelistTemplateAddress = await waitForDeploy(
      deployWhitelistTemplate(web3, callOptions.control)
    );
    const proxyAdminAddress = await waitForDeploy(
      deployProxyAdmin(web3, callOptions.control)
    );
    const datProxyAddress = await waitForDeploy(
      deployProxy(
        web3,
        callOptions.control,
        datTemplateAddress,
        proxyAdminAddress
      )
    );
    const whitelistProxyAddress = await waitForDeploy(
      deployProxy(
        web3,
        callOptions.control,
        whitelistTemplateAddress,
        proxyAdminAddress
      )
    );

    const dat = await getDat(web3, datProxyAddress);

    await dat.initialize(
      callOptions.initReserve,
      callOptions.currency,
      callOptions.initGoal,
      callOptions.buySlopeNum,
      callOptions.buySlopeDen,
      callOptions.investmentReserveBasisPoints,
      callOptions.name,
      callOptions.symbol,
      { from: callOptions.control }
    );

    const whitelist = await getWhitelist(web3, whitelistProxyAddress);
    await whitelist.initialize(dat.address, { from: callOptions.control });
    await whitelist.approve(dat.address, true, { from: callOptions.control });
    await whitelist.approve(callOptions.beneficiary, true, {
      from: callOptions.control
    });
    await whitelist.approve(callOptions.control, true, {
      from: callOptions.control
    });
    await whitelist.approve(callOptions.feeCollector, true, {
      from: callOptions.control
    });

    await dat.updateConfig(
      whitelist.address,
      callOptions.beneficiary,
      callOptions.control,
      callOptions.feeCollector,
      callOptions.feeBasisPoints,
      callOptions.autoBurn,
      callOptions.revenueCommitmentBasisPoints,
      callOptions.minInvestment,
      callOptions.openUntilAtLeast,
      {
        from: callOptions.control
      }
    );

    return { dat, whitelist };
  },
  getDat,
  getWhitelist
};
