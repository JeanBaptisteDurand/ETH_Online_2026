// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

interface IHookAuthorizable {
  function authorizedHooks(address hook) external view returns (bool);
}
