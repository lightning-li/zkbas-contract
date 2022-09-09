
const {getDeployedAddresses, getZkBNBProxyAndInterface} = require("./utils");
const fs = require('fs')

async function main() {
    const addrs = getDeployedAddresses('info/addresses.json');
    const {zkbnb, zkbnbInterface} = await getZkBNBProxyAndInterface(addrs.zkbnbProxy);
    let calldata = fs.readFileSync("scripts/deploy-keccak256/block_data/commitBlocks_1_c453.txt", "ascii");
    let result = zkbnbInterface.decodeFunctionData("commitBlocks", calldata);
    let commitTx = await zkbnb.commitBlocks(result[0], result[1]);
    await commitTx.wait()

    calldata = fs.readFileSync("scripts/deploy-keccak256/block_data/verifyBlocks_1_f9da.txt", "ascii");
    result = zkbnbInterface.decodeFunctionData("verifyAndExecuteBlocks", calldata);
    let verifyTx = await zkbnb.verifyAndExecuteBlocks(result[0], result[1]);
    await verifyTx.wait();

    calldata = fs.readFileSync("scripts/deploy-keccak256/block_data/commitBlocks_2_3f7d.txt", "ascii");
    result = zkbnbInterface.decodeFunctionData("commitBlocks", calldata);
    commitTx = await zkbnb.commitBlocks(result[0], result[1]);
    await commitTx.wait()

    calldata = fs.readFileSync("scripts/deploy-keccak256/block_data/verifyBlocks_2_696c.txt", "ascii");
    result = zkbnbInterface.decodeFunctionData("verifyAndExecuteBlocks", calldata);
    verifyTx = await zkbnb.verifyAndExecuteBlocks(result[0], result[1]);
    await verifyTx.wait();
    console.log("finish....");
}

main()
.then(() => process.exit(0))
.catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
});