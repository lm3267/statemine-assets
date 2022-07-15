import { EventHandlerContext } from "@subsquid/substrate-processor";
import { Store } from "@subsquid/typeorm-store";
import {
  Account,
  UniqueClass,
  UniqueInstance,
  AssetStatus,
  Transfer,
  TransferType,
  UniqueTransfer,
} from "../model/generated";
import { EntityConstructor } from "../types";
import { UniquesBurnedEvent, UniquesClassFrozenEvent, UniquesClassThawedEvent, UniquesCreatedEvent, UniquesDestroyedEvent, UniquesFrozenEvent, UniquesIssuedEvent, UniquesMetadataClearedEvent, UniquesMetadataSetEvent, UniquesThawedEvent, UniquesTransferredEvent } from "../types/events";
import { get, getOrCreate } from "./helpers/entity-utils";

/**
 * Must get entity from database
 * @param {Store} store
 * @param {EntityConstructor<T>} entityConstructor
 * @param {string} entityId
 *
 * @returns {Promise<T>}
 */
export async function getOrDie<T extends { id: string }>(
  store: Store,
  entityConstructor: EntityConstructor<T>,
  entityId: string
): Promise<T> {
  const entity = await get(store, entityConstructor, entityId);
  if (!entity) {
    throw new Error(`No ${entityConstructor} found for id: ${entityId}`);
  }
  return entity;
}

/**
 * Get Account by its wallet from database
 * @param {Store} store
 * @param {string} wallet
 *
 * @returns {Promise<T>}
 */
export async function getAccountByWallet(
  store: Store,
  wallet: string
): Promise<Account> {
  const account = await getOrCreate(store, Account, wallet);
  if (!account.wallet) {
    account.wallet = wallet;
    account.balance = 0n;
  }
  await store.save(account);
  return account;
}

export function getInstanceGlobalId(
  classId: string,
  instanceInnerId: string
): string {
  return `${classId}-${instanceInnerId}`;
}

export async function uniqueClassCreated(ctx: EventHandlerContext<Store>) {
  let event = new UniquesCreatedEvent(ctx);
  if (event.isV1) {
    var [classId, creator, owner] = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId, creator, owner} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const uniqueClass = new UniqueClass();

  uniqueClass.id = classId.toString();
  uniqueClass.creator = creator.toString();
  uniqueClass.owner = owner.toString();
  uniqueClass.status = AssetStatus.ACTIVE;

  await ctx.store.save(uniqueClass);

  const transfer = new UniqueTransfer();
  transfer.uniqueClass = uniqueClass;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.to = owner.toString();
  transfer.id = ctx.event.id;
  transfer.type = TransferType.CREATED;
  transfer.success = true;

  await ctx.store.save(transfer);
}

export async function uniqueClassFrozen(ctx: EventHandlerContext<Store>) {
  let event = new UniquesClassFrozenEvent(ctx);
  if (event.isV1) {
    var classId = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId} = event.asV700; 
  }
  else {
    throw event.constructor.name;
  }
  const class_ = await getOrCreate(ctx.store, UniqueClass, classId.toString());

  class_.status = AssetStatus.FREEZED;
  await ctx.store.save(class_);

  const transfer = new UniqueTransfer();
  transfer.uniqueClass = class_;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.id = ctx.event.id;
  transfer.type = TransferType.FREEZE;
  transfer.success = true;

  await ctx.store.save(transfer);
}

export async function uniqueClassThawed(ctx: EventHandlerContext<Store>) {
  let event = new UniquesClassThawedEvent(ctx);
  if (event.isV1) {
    var classId = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const class_ = await getOrCreate(ctx.store, UniqueClass, classId.toString());

  class_.status = AssetStatus.ACTIVE;
  await ctx.store.save(class_);

  const transfer = new UniqueTransfer();
  transfer.uniqueClass = class_;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.id = ctx.event.id;
  transfer.type = TransferType.THAWED;
  transfer.success = true;

  await ctx.store.save(transfer);
}

export async function uniqueClassDestroyed(ctx: EventHandlerContext<Store>) {
  let event = new UniquesDestroyedEvent(ctx);
  if (event.isV1) {
    var classId = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const class_ = await getOrCreate(ctx.store, UniqueClass, classId.toString());

  class_.status = AssetStatus.DESTROYED;
  await ctx.store.save(class_);

  const transfer = new UniqueTransfer();
  transfer.uniqueClass = class_;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.id = ctx.event.id;
  transfer.type = TransferType.DESTROYED;
  transfer.success = true;

  await ctx.store.save(transfer);
}

export async function uniqueInstanceIssued(ctx: EventHandlerContext<Store>) {
  let event = new UniquesIssuedEvent(ctx);
  if (event.isV1) {
    var [classId, instanceId, owner] = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId, instance, owner} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const uniqueClassPromise = getOrCreate(
    ctx.store,
    UniqueClass,
    classId.toString()
  );

  const ownerAccountPromise = getAccountByWallet(ctx.store, owner.toString());

  const [class_, ownerAccount] = await Promise.all([
    uniqueClassPromise,
    ownerAccountPromise,
  ]);

  class_.status = class_.status ?? AssetStatus.ACTIVE;
  await ctx.store.save(class_);

  const uniqueInstance = new UniqueInstance();
  const innerInstanceid = instanceId.toString();
  uniqueInstance.id = getInstanceGlobalId(class_.id, innerInstanceid);
  uniqueInstance.innerID = innerInstanceid;
  uniqueInstance.owner = ownerAccount;
  uniqueInstance.uniqueClass = class_;
  uniqueInstance.status = AssetStatus.ACTIVE;

  await ctx.store.save(uniqueInstance);

  const transfer = new UniqueTransfer();
  transfer.uniqueInstance = uniqueInstance;
  transfer.uniqueClass = class_;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.to = owner.toString();
  transfer.id = ctx.event.id;
  transfer.type = TransferType.MINT;
  transfer.success = true;

  await ctx.store.save(transfer);
}

export async function uniqueInstanceTransferred(ctx: EventHandlerContext<Store>) {
  let event = new UniquesTransferredEvent(ctx);
  if (event.isV1) {
    var [classId, instanceId, from, to] = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId, instance, from, to} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }

  const instanceProm = getOrDie(
    ctx.store,
    UniqueInstance,
    getInstanceGlobalId(classId.toString(), instanceId.toString())
  );
  const classProm = getOrDie(ctx.store, UniqueClass, classId.toString());
  const toAccProm = getAccountByWallet(ctx.store, to.toString());
  const [inst, class_, toAcc] = await Promise.all([
    instanceProm,
    classProm,
    toAccProm,
  ]);

  inst.owner = toAcc;

  const transfer = new UniqueTransfer();
  transfer.uniqueInstance = inst;
  transfer.uniqueClass = class_;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.to = to.toString();
  transfer.from = from.toString();
  transfer.id = ctx.event.id;
  transfer.type = TransferType.REGULAR;
  transfer.success = true;
  await ctx.store.save(transfer);
}

export async function uniqueInstanceBurned(ctx: EventHandlerContext<Store>) {
  let event = new UniquesBurnedEvent(ctx);
  if (event.isV1) {
    var [classId, instanceId, owner] = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId, instance, owner} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const instanceProm = getOrDie(
    ctx.store,
    UniqueInstance,
    getInstanceGlobalId(classId.toString(), instanceId.toString())
  );
  const classProm = getOrDie(ctx.store, UniqueClass, classId.toString());
  const [inst, class_] = await Promise.all([instanceProm, classProm]);

  inst.status = AssetStatus.DESTROYED;
  await ctx.store.save(inst);

  const transfer = new UniqueTransfer();
  transfer.uniqueInstance = inst;
  transfer.uniqueClass = class_;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.from = owner.toString();
  transfer.id = ctx.event.id;
  transfer.type = TransferType.BURN;
  transfer.success = true;
  await ctx.store.save(transfer);
}

export async function uniqueInstanceFrozen(ctx: EventHandlerContext<Store>) {
  let event = new UniquesFrozenEvent(ctx);
  if (event.isV1) {
    var [classId, instanceId] = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId, instance} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const instanceProm = getOrDie(
    ctx.store,
    UniqueInstance,
    getInstanceGlobalId(classId.toString(), instanceId.toString())
  );
  const classProm = getOrDie(ctx.store, UniqueClass, classId.toString());
  const [inst, class_] = await Promise.all([instanceProm, classProm]);

  inst.status = AssetStatus.FREEZED;
  await ctx.store.save(inst);

  const transfer = new UniqueTransfer();

  transfer.uniqueInstance = inst;
  transfer.uniqueClass = class_;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.id = ctx.event.id;
  transfer.type = TransferType.FREEZE;
  transfer.success = true;
  await ctx.store.save(transfer);
}

export async function uniqueInstanceThawed(ctx: EventHandlerContext<Store>) {
  let event = new UniquesThawedEvent(ctx);
  if (event.isV1) {
    var [classId, instanceId] = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId, instance} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const instanceProm = getOrDie(
    ctx.store,
    UniqueInstance,
    getInstanceGlobalId(classId.toString(), instanceId.toString())
  );
  const classProm = getOrDie(ctx.store, UniqueClass, classId.toString());
  const [inst, class_] = await Promise.all([instanceProm, classProm]);

  inst.status = AssetStatus.ACTIVE;
  await ctx.store.save(inst);

  const transfer = new UniqueTransfer();

  transfer.uniqueInstance = inst;
  transfer.uniqueClass = class_;
  transfer.blockHash = ctx.block.hash;
  transfer.blockNum = ctx.block.height;
  transfer.createdAt = new Date(ctx.block.timestamp);
  transfer.extrinisicId = ctx.event.extrinsic?.id;
  transfer.id = ctx.event.id;
  transfer.type = TransferType.THAWED;
  transfer.success = true;
  await ctx.store.save(transfer);
}

export async function uniquesMetadataSet(ctx: EventHandlerContext<Store>) {
  let event = new UniquesMetadataSetEvent(ctx);
  if (event.isV1) {
    var [classId, instance, data, isFrozen] = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId, instance, data, isFrozen} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const classProm = await getOrDie(ctx.store, UniqueClass, classId.toString());
  classProm.data = hexToString(data.toString());
  classProm.instances.push(await getOrDie(ctx.store, UniqueInstance, instance.toString())); 
  classProm.status = isFrozen ? AssetStatus.FREEZED : AssetStatus.ACTIVE;
  await ctx.store.save(classProm);
}

export async function UniquesMetadataCleared(ctx: EventHandlerContext<Store>) {
  let event = new UniquesMetadataClearedEvent(ctx);
  if (event.isV1) {
    var [classId, instance] = event.asV1;
  }
  else if (event.isV700) {
    var {class: classId, instance} = event.asV700;
  }
  else {
    throw event.constructor.name;
  }
  const classProm = await getOrDie(ctx.store, UniqueClass, classId.toString());
  classProm.data = null;
  await ctx.store.save(classProm);
}

function hexToString(text: string) {
	return text.startsWith('0x') ? Buffer.from(text.replace(/^0x/, ''), 'hex').toString() : text 
}