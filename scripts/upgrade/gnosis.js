const hardhat = require('hardhat');
const { getDeployedAddresses, deployDesertVerifier } = require('../deploy-keccak256/utils');
const { ethers } = hardhat;
const { EthersAdapter } = require('@safe-global/protocol-kit');
const Safe = require('@safe-global/safe-core-sdk').default;
const { SafeEthersSigner, SafeService } = require('@safe-global/safe-ethers-adapters');
require('dotenv').config();

const inquirer = require('inquirer');
const figlet = require('figlet');
const chalk = require('chalk');

const AddressZero = ethers.constants.AddressZero;

let targetContracts;
const addrs = getDeployedAddresses('info/addresses.json');

const targetContractsDeployed = {
  governance: AddressZero,
  verifier: AddressZero,
  zkbnb: AddressZero,
};

const zkBNBUpgradeParameter = {
  additionalZkBNB: AddressZero,
  desertVerifier: AddressZero,
};

Object.defineProperty(String.prototype, 'capitalize', {
  value() {
    return this.charAt(0).toUpperCase() + this.slice(1);
  },
  enumerable: false,
});

function main() {
  console.log(chalk.green(figlet.textSync('zkBNB upgradeable tool')));

  if (!hardhat.network.name) {
    console.log(chalk.red(`🙃 Contract not deploy in ${hardhat.network.name}`));
    return;
  }
  inquirer
    .prompt([
      {
        type: 'list',
        name: 'operator',
        message: 'What do you want?',
        choices: ['start', 'preparation', 'cut period', 'cancel', 'finish', 'rollback'],
      },
    ])
    .then(async (answers) => {
      switch (answers.operator) {
        case 'start':
          start();
          break;
        case 'cancel':
          cancel();
          break;
        case 'preparation':
          preparation();
          break;
        case 'cut period':
          cutPeriod();
          break;
        case 'finish':
          finish();
          break;
        case 'rollback':
          inquirer
            .prompt([
              {
                type: 'input',
                name: 'target',
                message:
                  'Please enter the block number when the contract was deployed \nand the script will query the upgrade history:',
                validate(answer) {
                  console.log('🚀 ~ file: index.js:295 ~ validate ~ answer:', answer);
                  if (answer.length < 1) {
                    return 'You must input block number.';
                  }

                  return true;
                },
              },
            ])
            .then(async (answer) => {
              rollback(+answer.target);
            });
          break;

        default:
          break;
      }
    });
}

async function start() {
  const { gnosisUpgradeGatekeeper, upgradeGatekeeper } = await getGnosisupgradeGatekeeper();
  const owner = await upgradeGatekeeper.getMaster();

  const status = await upgradeGatekeeper.upgradeStatus();
  if (status !== 0 /* idle */) {
    console.log(chalk.red(`🙃 Update flow is in progress`));
    return;
  }

  inquirer
    .prompt([
      {
        type: 'checkbox',
        name: 'target',
        message: 'Which contracts do you want to upgrade?',
        choices: ['governance', 'verifier', 'zkbnb'],

        validate(answer) {
          if (answer.length < 1) {
            return 'You must choose at least one topping.';
          }

          return true;
        },
      },
    ])
    .then(async (answers) => {
      targetContracts = answers.target;
      console.log(chalk.green('🚀 Deploy new contract'));
      for (const contract of targetContracts) {
        let deployContract, additionalZkBNB, desertVerifier;
        let Governance, ZkBNBVerifier, ZkBNB, AdditionalZkBNB;

        switch (contract) {
          case 'governance':
            Governance = await ethers.getContractFactory('Governance', {
              libraries: {
                Utils: addrs.utils,
              },
            });
            deployContract = await Governance.deploy();
            break;
          case 'verifier':
            ZkBNBVerifier = await ethers.getContractFactory('ZkBNBVerifier');
            deployContract = await ZkBNBVerifier.deploy();
            break;
          case 'zkbnb':
            ZkBNB = await ethers.getContractFactory('ZkBNB', {
              libraries: {
                TxTypes: addrs.txTypes,
              },
            });
            deployContract = await ZkBNB.deploy();

            await inquirer
              .prompt([
                {
                  type: 'list',
                  name: 'zkbnbParams',
                  message: 'Do you want to update additionalZkBNB and/or desertVerifier addresses?',
                  choices: ['No', 'Yes only additionalZkBNB', 'Yes only desertVerifier', 'Yes both'],
                },
              ])
              .then(async (answer) => {
                switch (answer.zkbnbParams) {
                  case 'No':
                    break;
                  case 'Yes only additionalZkBNB':
                    AdditionalZkBNB = await ethers.getContractFactory('AdditionalZkBNB');
                    additionalZkBNB = await AdditionalZkBNB.deploy();
                    await additionalZkBNB.deployed();

                    zkBNBUpgradeParameter['additionalZkBNB'] = additionalZkBNB.address;
                    break;
                  case 'Yes only desertVerifier':
                    desertVerifier = await deployDesertVerifier(owner);
                    await desertVerifier.deployed();

                    zkBNBUpgradeParameter['desertVerifier'] = desertVerifier.address;
                    break;
                  case 'Yes both':
                    AdditionalZkBNB = await ethers.getContractFactory('AdditionalZkBNB');
                    additionalZkBNB = await AdditionalZkBNB.deploy();
                    await additionalZkBNB.deployed();

                    desertVerifier = await deployDesertVerifier(owner);
                    await desertVerifier.deployed();

                    zkBNBUpgradeParameter['additionalZkBNB'] = additionalZkBNB.address;
                    zkBNBUpgradeParameter['desertVerifier'] = desertVerifier.address;
                    break;

                  default:
                    break;
                }
                console.log(
                  'zkBNB upgrade parameters: [%s, %s]',
                  additionalZkBNB ? additionalZkBNB.address : AddressZero,
                  desertVerifier ? desertVerifier.address : AddressZero,
                );
              });
            break;

          default:
            break;
        }
        await deployContract.deployed();
        targetContractsDeployed[contract] = deployContract.address;
        console.log('%s deployed \t in %s', contract.capitalize(), deployContract.address);
      }

      await inquirer
        .prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Above contract will be upgrade. \n Do you want continue?',
          },
        ])
        .then(async (answers) => {
          if (!answers.confirm) {
            return;
          }

          console.log(chalk.green('🚚 Start Upgrade'));
          await gnosisUpgradeGatekeeper.startUpgrade([
            targetContractsDeployed.governance,
            targetContractsDeployed.verifier,
            targetContractsDeployed.zkbnb,
          ]);
          console.log(chalk.green('💻 Go to the Safe Web App [https://app.safe.global] to confirm the transaction'));
        });
    });
}

async function preparation() {
  const { gnosisUpgradeGatekeeper, upgradeGatekeeper } = await getGnosisupgradeGatekeeper();

  const upgradeStatus = await upgradeGatekeeper.upgradeStatus();
  if (upgradeStatus !== 1) {
    console.log(chalk.red('🙃 Not ready for prepare'));
    return;
  }
  await gnosisUpgradeGatekeeper.startPreparation();
  console.log(chalk.green('💻 Go to the Safe Web App [https://app.safe.global] to confirm the transaction'));
}

async function cancel() {
  const { gnosisUpgradeGatekeeper } = await getGnosisupgradeGatekeeper();

  console.log(chalk.green('🚀 Cancel Upgrade'));
  await gnosisUpgradeGatekeeper.cancelUpgrade();
  console.log(chalk.green('💻 Go to the Safe Web App [https://app.safe.global] to confirm the transaction'));
}

async function cutPeriod() {
  console.log(chalk.red('🚀 Please invoke contract function in BSCScan'));
}

async function finish() {
  const { gnosisUpgradeGatekeeper, upgradeGatekeeper } = await getGnosisupgradeGatekeeper();

  const upgradeStatus = await upgradeGatekeeper.upgradeStatus();
  if (upgradeStatus !== 2) {
    console.log(chalk.red('🙃 Already in the preparation stage'));
    return;
  }
  console.log(chalk.green('🚀 Finish Upgrade'));
  await gnosisUpgradeGatekeeper.finishUpgrade([
    '0x00',
    '0x00',
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'address'], // newAdditionalZkBNB.addresss, newDesertVerifier.addresss
      [zkBNBUpgradeParameter['additionalZkBNB'], zkBNBUpgradeParameter['desertVerifier']],
    ),
  ]);
  console.log(chalk.green('💻 Go to the Safe Web App [https://app.safe.global] to confirm the transaction'));
}

async function rollback(startBlockNumber) {
  const { gnosisUpgradeGatekeeper, upgradeGatekeeper } = await getGnosisupgradeGatekeeper();

  const status = await upgradeGatekeeper.upgradeStatus();
  if (status !== 0 /* idle */) {
    console.log(chalk.red(`🙃 Update flow is in progress`));
    return;
  }

  console.log(chalk.green('🚀 Rollback'));
  const versionId = await upgradeGatekeeper.versionId();
  console.log(`current version is ${chalk.red(versionId)}`);

  console.log(chalk.green('🔍 search old version...'));
  let previousVersionTargets;
  // If it is the first version, should get the implementation contract address directly from the proxy contract
  if (versionId == 0) {
    previousVersionTargets = {
      governance: await (await ethers.getContractFactory('Proxy')).attach(addrs.governance).getTarget(),
      verifier: await (await ethers.getContractFactory('Proxy')).attach(addrs.verifierProxy).getTarget(),
      zkbnb: await (await ethers.getContractFactory('Proxy')).attach(addrs.zkbnbProxy).getTarget(),
    };
  } else {
    const filter = upgradeGatekeeper.filters.UpgradeComplete(versionId - 1);
    const event = await upgradeGatekeeper.queryFilter(filter, startBlockNumber - 1, startBlockNumber + 100);
    const targets = event[0].args.newTargets;
    previousVersionTargets = {
      governance: targets[0],
      verifier: targets[1],
      zkbnb: targets[2],
    };
  }

  console.log(chalk.green('🚚 Start rollback'));

  console.log('**** Old implement Contract ****');
  console.table(previousVersionTargets);
  console.log('********************************');

  inquirer
    .prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'The contract will be rolled back to the previous version. \n Do you want continue?',
      },
    ])
    .then(async (answers) => {
      if (!answers.confirm) {
        return;
      }

      console.log(chalk.green('✅ rollback process started'));
      await gnosisUpgradeGatekeeper.startUpgrade([
        previousVersionTargets.governance,
        previousVersionTargets.verifier,
        previousVersionTargets.zkbnb,
      ]);
      console.log(chalk.green('💻 Go to the Safe Web App [https://app.safe.global] to confirm the transaction'));
      console.log('after that, you still need to do preparation and finish step.');
    });
}

async function getGnosisupgradeGatekeeper() {
  const UpgradeGatekeeper = await ethers.getContractFactory('UpgradeGatekeeper');
  const upgradeGatekeeper = await UpgradeGatekeeper.attach(addrs.upgradeGateKeeper);
  const owner = await upgradeGatekeeper.getMaster();

  const signerOrProvider = await ethers.getSigner();
  const ethAdapter = new EthersAdapter({ ethers, signerOrProvider });

  const safe = await Safe.create({
    ethAdapter,
    safeAddress: owner,
  });

  // https://docs.safe.global/learn/safe-core/safe-core-api/available-services
  const safeService = new SafeService(process.env.GNOSIS_SERVICE);

  const gnosisSigner = new SafeEthersSigner(safe, safeService, signerOrProvider);
  const gnosisUpgradeGatekeeper = upgradeGatekeeper.connect(gnosisSigner);

  return {
    gnosisUpgradeGatekeeper,
    upgradeGatekeeper,
  };
}

main();
