const path=require('node:path');
module.exports={rootDir:path.resolve(__dirname,'../../../..'),roots:[__dirname],preset:'jest-expo/ios',testMatch:['**/*-audit.ui.test.jsx'],clearMocks:true,testTimeout:15000};
