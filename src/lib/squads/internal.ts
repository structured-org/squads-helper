import invariant from 'invariant';
import * as beet from '@metaplex-foundation/beet';
import * as beetSolana from '@metaplex-foundation/beet-solana';
import { web3 } from '@project-serum/anchor';
import {
  AddressLookupTableAccount,
  AccountKeysFromLookups,
  MessageHeader,
  TransactionInstruction,
  PublicKey,
  MessageAccountKeys,
  MessageV0,
} from '@solana/web3.js';
import assert from 'assert';

export type BatchAddTransactionArgs = {
  ephemeralSigners: number;
  transactionMessage: Uint8Array;
};

const batchAddTransactionArgsBeet =
  new beet.FixableBeetArgsStruct<BatchAddTransactionArgs>(
    [
      ['ephemeralSigners', beet.u8],
      ['transactionMessage', beet.bytes],
    ],
    'BatchAddTransactionArgs',
  );

export type BatchAddTransactionInstructionArgs = {
  args: BatchAddTransactionArgs;
};

const batchAddTransactionStruct = new beet.FixableBeetArgsStruct<
  BatchAddTransactionInstructionArgs & {
    instructionDiscriminator: number[] /* size: 8 */;
  }
>(
  [
    ['instructionDiscriminator', beet.uniformFixedSizeArray(beet.u8, 8)],
    ['args', batchAddTransactionArgsBeet],
  ],
  'BatchAddTransactionInstructionArgs',
);

const batchAddTransactionInstructionDiscriminator = [
  89, 100, 224, 18, 69, 70, 54, 76,
];

export type BatchAddTransactionInstructionAccounts = {
  multisig: web3.PublicKey;
  proposal: web3.PublicKey;
  batch: web3.PublicKey;
  transaction: web3.PublicKey;
  member: web3.PublicKey;
  rentPayer: web3.PublicKey;
  systemProgram?: web3.PublicKey;
  anchorRemainingAccounts?: web3.AccountMeta[];
};

export function createBatchAddTransactionInstruction(
  accounts: BatchAddTransactionInstructionAccounts,
  args: BatchAddTransactionInstructionArgs,
  programId = new web3.PublicKey('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf'),
) {
  const [data] = batchAddTransactionStruct.serialize({
    instructionDiscriminator: batchAddTransactionInstructionDiscriminator,
    ...args,
  });
  const keys: web3.AccountMeta[] = [
    {
      pubkey: accounts.multisig,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.proposal,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.batch,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: accounts.transaction,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: accounts.member,
      isWritable: false,
      isSigner: true,
    },
    {
      pubkey: accounts.rentPayer,
      isWritable: true,
      isSigner: true,
    },
    {
      pubkey: accounts.systemProgram ?? web3.SystemProgram.programId,
      isWritable: false,
      isSigner: false,
    },
  ];

  if (accounts.anchorRemainingAccounts != null) {
    for (const acc of accounts.anchorRemainingAccounts) {
      keys.push(acc);
    }
  }

  const ix = new web3.TransactionInstruction({
    programId,
    keys,
    data,
  });
  return ix;
}

export type TransactionMessage = {
  numSigners: number;
  numWritableSigners: number;
  numWritableNonSigners: number;
  accountKeys: web3.PublicKey[];
  instructions: CompiledMsInstruction[];
  addressTableLookups: MessageAddressTableLookup[];
};

export type CompiledMsInstruction = {
  programIdIndex: number;
  accountIndexes: number[];
  data: number[];
};

export function fixedSizeSmallArray<T, V = Partial<T>>(
  lengthBeet: beet.FixedSizeBeet<number>,
  elements: beet.FixedSizeBeet<T, V>[],
  elementsByteSize: number,
): beet.FixedSizeBeet<T[], V[]> {
  const len = elements.length;
  const firstElement = len === 0 ? '<EMPTY>' : elements[0].description;

  return {
    write: function (buf: Buffer, offset: number, value: V[]): void {
      invariant(
        value.length === len,
        `array length ${value.length} should match len ${len}`,
      );
      lengthBeet.write(buf, offset, len);

      let cursor = offset + lengthBeet.byteSize;
      for (let i = 0; i < len; i++) {
        const element = elements[i];
        element.write(buf, cursor, value[i]);
        cursor += element.byteSize;
      }
    },

    read: function (buf: Buffer, offset: number): T[] {
      const size = lengthBeet.read(buf, offset);
      invariant(size === len, 'invalid byte size');

      let cursor = offset + lengthBeet.byteSize;
      const arr: T[] = new Array(len);
      for (let i = 0; i < len; i++) {
        const element = elements[i];
        arr[i] = element.read(buf, cursor);
        cursor += element.byteSize;
      }
      return arr;
    },
    byteSize: lengthBeet.byteSize + elementsByteSize,
    length: len,
    description: `Array<${firstElement}>(${len})[ ${lengthBeet.byteSize} + ${elementsByteSize} ]`,
  };
}

export function smallArray<T, V = Partial<T>>(
  lengthBeet: beet.FixedSizeBeet<number>,
  element: beet.Beet<T, V>,
): beet.FixableBeet<T[], V[]> {
  return {
    toFixedFromData(buf: Buffer, offset: number): beet.FixedSizeBeet<T[], V[]> {
      const len = lengthBeet.read(buf, offset);
      const cursorStart = offset + lengthBeet.byteSize;
      let cursor = cursorStart;

      const fixedElements: beet.FixedSizeBeet<T, V>[] = new Array(len);
      for (let i = 0; i < len; i++) {
        const fixedElement = beet.fixBeetFromData(
          element,
          buf,
          cursor,
        ) as beet.FixedSizeBeet<T, V>;
        fixedElements[i] = fixedElement;
        cursor += fixedElement.byteSize;
      }
      return fixedSizeSmallArray(
        lengthBeet,
        fixedElements,
        cursor - cursorStart,
      );
    },

    toFixedFromValue(vals: V[]): beet.FixedSizeBeet<T[], V[]> {
      invariant(Array.isArray(vals), `${vals} should be an array`);

      let elementsSize = 0;
      const fixedElements: beet.FixedSizeBeet<T, V>[] = new Array(vals.length);

      for (let i = 0; i < vals.length; i++) {
        const fixedElement: beet.FixedSizeBeet<T, V> = beet.fixBeetFromValue<
          T,
          V
        >(element, vals[i]);
        fixedElements[i] = fixedElement;
        elementsSize += fixedElement.byteSize;
      }
      return fixedSizeSmallArray(lengthBeet, fixedElements, elementsSize);
    },

    description: `smallArray`,
  };
}

export type MessageAddressTableLookup = {
  /** Address lookup table account key */
  accountKey: web3.PublicKey;
  /** List of indexes used to load writable account addresses */
  writableIndexes: number[];
  /** List of indexes used to load readonly account addresses */
  readonlyIndexes: number[];
};

const messageAddressTableLookupBeet =
  new beet.FixableBeetArgsStruct<MessageAddressTableLookup>(
    [
      ['accountKey', beetSolana.publicKey],
      ['writableIndexes', smallArray(beet.u8, beet.u8)],
      ['readonlyIndexes', smallArray(beet.u8, beet.u8)],
    ],
    'MessageAddressTableLookup',
  );

const compiledMsInstructionBeet =
  new beet.FixableBeetArgsStruct<CompiledMsInstruction>(
    [
      ['programIdIndex', beet.u8],
      ['accountIndexes', smallArray(beet.u8, beet.u8)],
      ['data', smallArray(beet.u16, beet.u8)],
    ],
    'CompiledMsInstruction',
  );

export const transactionMessageBeet =
  new beet.FixableBeetArgsStruct<TransactionMessage>(
    [
      ['numSigners', beet.u8],
      ['numWritableSigners', beet.u8],
      ['numWritableNonSigners', beet.u8],
      ['accountKeys', smallArray(beet.u8, beetSolana.publicKey)],
      ['instructions', smallArray(beet.u8, compiledMsInstructionBeet)],
      [
        'addressTableLookups',
        smallArray(beet.u8, messageAddressTableLookupBeet),
      ],
    ],
    'TransactionMessage',
  );

export type CompiledKeyMeta = {
  isSigner: boolean;
  isWritable: boolean;
  isInvoked: boolean;
};

export type KeyMetaMap = Map<string, CompiledKeyMeta>;

/**
 *  This is almost completely copy-pasted from solana-web3.js and slightly adapted to work with "wrapped" transaction messaged such as in VaultTransaction.
 *  @see https://github.com/solana-labs/solana-web3.js/blob/87d33ac68e2453b8a01cf8c425aa7623888434e8/packages/library-legacy/src/message/compiled-keys.ts
 */
export class CompiledKeys {
  payer: PublicKey;
  keyMetaMap: KeyMetaMap;

  constructor(payer: PublicKey, keyMetaMap: KeyMetaMap) {
    this.payer = payer;
    this.keyMetaMap = keyMetaMap;
  }

  /**
   * The only difference between this and the original is that we don't mark the instruction programIds as invoked.
   * It makes sense to do because the instructions will be called via CPI, so the programIds can come from Address Lookup Tables.
   * This allows to compress the message size and avoid hitting the tx size limit during vault_transaction_create instruction calls.
   */
  static compile(
    instructions: Array<TransactionInstruction>,
    payer: PublicKey,
  ): CompiledKeys {
    const keyMetaMap: KeyMetaMap = new Map();
    const getOrInsertDefault = (pubkey: PublicKey): CompiledKeyMeta => {
      const address = pubkey.toBase58();
      let keyMeta = keyMetaMap.get(address);
      if (keyMeta === undefined) {
        keyMeta = {
          isSigner: false,
          isWritable: false,
          isInvoked: false,
        };
        keyMetaMap.set(address, keyMeta);
      }
      return keyMeta;
    };

    const payerKeyMeta = getOrInsertDefault(payer);
    payerKeyMeta.isSigner = true;
    payerKeyMeta.isWritable = true;

    for (const ix of instructions) {
      // This is the only difference from the original.
      // getOrInsertDefault(ix.programId).isInvoked = true;
      getOrInsertDefault(ix.programId).isInvoked = false;
      for (const accountMeta of ix.keys) {
        const keyMeta = getOrInsertDefault(accountMeta.pubkey);
        keyMeta.isSigner ||= accountMeta.isSigner;
        keyMeta.isWritable ||= accountMeta.isWritable;
      }
    }

    return new CompiledKeys(payer, keyMetaMap);
  }

  getMessageComponents(): [MessageHeader, Array<PublicKey>] {
    const mapEntries = [...this.keyMetaMap.entries()];
    assert(mapEntries.length <= 256, 'Max static account keys length exceeded');

    const writableSigners = mapEntries.filter(
      ([, meta]) => meta.isSigner && meta.isWritable,
    );
    const readonlySigners = mapEntries.filter(
      ([, meta]) => meta.isSigner && !meta.isWritable,
    );
    const writableNonSigners = mapEntries.filter(
      ([, meta]) => !meta.isSigner && meta.isWritable,
    );
    const readonlyNonSigners = mapEntries.filter(
      ([, meta]) => !meta.isSigner && !meta.isWritable,
    );

    const header: MessageHeader = {
      numRequiredSignatures: writableSigners.length + readonlySigners.length,
      numReadonlySignedAccounts: readonlySigners.length,
      numReadonlyUnsignedAccounts: readonlyNonSigners.length,
    };

    // sanity checks
    {
      assert(
        writableSigners.length > 0,
        'Expected at least one writable signer key',
      );
      const [payerAddress] = writableSigners[0];
      assert(
        payerAddress === this.payer.toBase58(),
        'Expected first writable signer key to be the fee payer',
      );
    }

    const staticAccountKeys = [
      ...writableSigners.map(([address]) => new PublicKey(address)),
      ...readonlySigners.map(([address]) => new PublicKey(address)),
      ...writableNonSigners.map(([address]) => new PublicKey(address)),
      ...readonlyNonSigners.map(([address]) => new PublicKey(address)),
    ];

    return [header, staticAccountKeys];
  }

  extractTableLookup(
    lookupTable: AddressLookupTableAccount,
  ): [MessageAddressTableLookup, AccountKeysFromLookups] | undefined {
    const [writableIndexes, drainedWritableKeys] =
      this.drainKeysFoundInLookupTable(
        lookupTable.state.addresses,
        (keyMeta) =>
          !keyMeta.isSigner && !keyMeta.isInvoked && keyMeta.isWritable,
      );
    const [readonlyIndexes, drainedReadonlyKeys] =
      this.drainKeysFoundInLookupTable(
        lookupTable.state.addresses,
        (keyMeta) =>
          !keyMeta.isSigner && !keyMeta.isInvoked && !keyMeta.isWritable,
      );

    // Don't extract lookup if no keys were found
    if (writableIndexes.length === 0 && readonlyIndexes.length === 0) {
      return;
    }

    return [
      {
        accountKey: lookupTable.key,
        writableIndexes,
        readonlyIndexes,
      },
      {
        writable: drainedWritableKeys,
        readonly: drainedReadonlyKeys,
      },
    ];
  }

  /** @internal */
  private drainKeysFoundInLookupTable(
    lookupTableEntries: Array<PublicKey>,
    keyMetaFilter: (keyMeta: CompiledKeyMeta) => boolean,
  ): [Array<number>, Array<PublicKey>] {
    const lookupTableIndexes = [];
    const drainedKeys = [];

    for (const [address, keyMeta] of this.keyMetaMap.entries()) {
      if (keyMetaFilter(keyMeta)) {
        const key = new PublicKey(address);
        const lookupTableIndex = lookupTableEntries.findIndex((entry) =>
          entry.equals(key),
        );
        if (lookupTableIndex >= 0) {
          assert(lookupTableIndex < 256, 'Max lookup table index exceeded');
          lookupTableIndexes.push(lookupTableIndex);
          drainedKeys.push(key);
          this.keyMetaMap.delete(address);
        }
      }
    }

    return [lookupTableIndexes, drainedKeys];
  }
}

export function compileToWrappedMessageV0({
  payerKey,
  recentBlockhash,
  instructions,
  addressLookupTableAccounts,
}: {
  payerKey: web3.PublicKey;
  recentBlockhash: string;
  instructions: web3.TransactionInstruction[];
  addressLookupTableAccounts?: AddressLookupTableAccount[];
}) {
  const compiledKeys = CompiledKeys.compile(instructions, payerKey);

  const addressTableLookups = new Array<MessageAddressTableLookup>();
  const accountKeysFromLookups: AccountKeysFromLookups = {
    writable: [],
    readonly: [],
  };
  const lookupTableAccounts = addressLookupTableAccounts || [];
  for (const lookupTable of lookupTableAccounts) {
    const extractResult = compiledKeys.extractTableLookup(lookupTable);
    if (extractResult !== undefined) {
      const [addressTableLookup, { writable, readonly }] = extractResult;
      addressTableLookups.push(addressTableLookup);
      accountKeysFromLookups.writable.push(...writable);
      accountKeysFromLookups.readonly.push(...readonly);
    }
  }

  const [header, staticAccountKeys] = compiledKeys.getMessageComponents();
  const accountKeys = new MessageAccountKeys(
    staticAccountKeys,
    accountKeysFromLookups,
  );
  const compiledInstructions = accountKeys.compileInstructions(instructions);
  return new MessageV0({
    header,
    staticAccountKeys,
    recentBlockhash,
    compiledInstructions,
    addressTableLookups,
  });
}
