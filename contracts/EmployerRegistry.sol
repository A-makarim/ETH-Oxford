// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract EmployerRegistry is Ownable {
    mapping(address employer => bool exists) private _isEmployer;

    event EmployerAdded(address employer);
    event EmployerRemoved(address employer);

    error InvalidEmployer();
    error EmployerAlreadyExists();
    error EmployerNotFound();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function addEmployer(address employer) external onlyOwner {
        if (employer == address(0)) revert InvalidEmployer();
        if (_isEmployer[employer]) revert EmployerAlreadyExists();

        _isEmployer[employer] = true;
        emit EmployerAdded(employer);
    }

    function removeEmployer(address employer) external onlyOwner {
        if (!_isEmployer[employer]) revert EmployerNotFound();

        _isEmployer[employer] = false;
        emit EmployerRemoved(employer);
    }

    function isEmployer(address employer) external view returns (bool) {
        return _isEmployer[employer];
    }
}

