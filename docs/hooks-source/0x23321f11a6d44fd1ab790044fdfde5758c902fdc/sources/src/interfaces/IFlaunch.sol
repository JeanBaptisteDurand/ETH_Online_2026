// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PositionManager} from '@flaunch/PositionManager.sol';


interface IFlaunch {

    function flaunch(PositionManager.FlaunchParams calldata) external returns (address memecoin_, address payable memecoinTreasury_, uint tokenId_);

}
