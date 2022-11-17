// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.6;

import "./interfaces/NFTFactory.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ZkBNBNFTFactory is ERC721, NFTFactory {
  // Optional mapping from token ID to token content hash
  mapping(uint256 => bytes32) private _contentHashes;

  // tokenId => creator
  mapping(uint256 => address) private _nftCreators;

  string public _base;

  address private _zkbnbAddress;

  constructor(
    string memory name,
    string memory symbol,
    string memory base,
    address zkbnbAddress
  ) ERC721(name, symbol) {
    _zkbnbAddress = zkbnbAddress;
    _base = base;
  }

  function mintFromZkBNB(
    address _creatorAddress,
    address _toAddress,
    uint256 _nftTokenId,
    bytes32 _nftContentHash,
    bytes memory _extraData
  ) external override {
    require(_msgSender() == _zkbnbAddress, "only zkbnbAddress");
    // Minting allowed only from zkbnb
    _safeMint(_toAddress, _nftTokenId);
    _contentHashes[_nftTokenId] = _nftContentHash;
    _nftCreators[_nftTokenId] = _creatorAddress;
    emit MintNFTFromZkBNB(_creatorAddress, _toAddress, _nftTokenId, _nftContentHash, _extraData);
  }

  function _beforeTokenTransfer(
    address,
    address to,
    uint256 tokenId
  ) internal virtual override {
    // Sending to address `0` means that the token is getting burned.
    if (to == address(0)) {
      delete _contentHashes[tokenId];
      delete _nftCreators[tokenId];
    }
  }

  function getContentHash(uint256 _tokenId) external view returns (bytes32) {
    return _contentHashes[_tokenId];
  }

  function getCreator(uint256 _tokenId) external view returns (address) {
    return _nftCreators[_tokenId];
  }

  function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
    require(_exists(tokenId), "tokenId not exist");
    // TODO
    //        string memory base = "ipfs://";
    return string(abi.encodePacked(_base, _contentHashes[tokenId]));
  }

  function updateBaseUri(string memory base) external {
    _base = base;
  }
}
