import prisma from '../db/prisma';
import { updateAgentReputation, recordReputationEvent } from './reputation';
import { Decimal } from '@prisma/client/runtime/library';

interface StakeResult {
  agentId: string;
  previousStake: number;
  newStake: number;
  newReputationScore: number;
}

export async function addStake(
  agentExternalId: string,
  developerId: string,
  amount: number
): Promise<StakeResult> {
  if (amount <= 0) {
    throw new Error('Stake amount must be positive');
  }

  const agent = await prisma.agent.findUnique({
    where: { developerId_externalId: { developerId, externalId: agentExternalId } }
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  const previousStake = Number(agent.stakeAmount);
  const newStake = previousStake + amount;

  // Update stake amount
  await prisma.agent.update({
    where: { id: agent.id },
    data: { stakeAmount: new Decimal(newStake) }
  });

  // Record the event
  const stakeBonus = Math.min(15, 5 + Math.floor(newStake / 100)) -
                     Math.min(15, 5 + Math.floor(previousStake / 100));
  await recordReputationEvent(agent.id, 'stake_added', stakeBonus);

  // Recalculate reputation
  const newReputationScore = await updateAgentReputation(agent.id);

  return {
    agentId: agent.externalId,
    previousStake,
    newStake,
    newReputationScore
  };
}

export async function withdrawStake(
  agentExternalId: string,
  developerId: string,
  amount: number
): Promise<StakeResult> {
  if (amount <= 0) {
    throw new Error('Withdrawal amount must be positive');
  }

  const agent = await prisma.agent.findUnique({
    where: { developerId_externalId: { developerId, externalId: agentExternalId } }
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  const previousStake = Number(agent.stakeAmount);

  if (amount > previousStake) {
    throw new Error('Insufficient stake balance');
  }

  const newStake = previousStake - amount;

  // Update stake amount
  await prisma.agent.update({
    where: { id: agent.id },
    data: { stakeAmount: new Decimal(newStake) }
  });

  // Recalculate reputation
  const newReputationScore = await updateAgentReputation(agent.id);

  return {
    agentId: agent.externalId,
    previousStake,
    newStake,
    newReputationScore
  };
}

export async function getStakeInfo(agentExternalId: string, developerId: string) {
  const agent = await prisma.agent.findUnique({
    where: { developerId_externalId: { developerId, externalId: agentExternalId } }
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  const stakeAmount = Number(agent.stakeAmount);
  const stakeBonus = stakeAmount > 0 ? Math.min(15, 5 + Math.floor(stakeAmount / 100)) : 0;

  return {
    agentId: agent.externalId,
    stakeAmount,
    stakeBonus,
    reputationScore: agent.reputationScore
  };
}
