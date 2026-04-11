import { loadServerConfig, loadAccounts, saveAccounts } from '../src/config';
import { computeHA1 } from '../src/auth';
import type { SipAccount } from '../src/types';

const config = loadServerConfig();

function usage(): void {
  console.log(`
SIP Account Manager
====================

Usage:
  npx ts-node scripts/manage-accounts.ts <command> [options]

Commands:
  add     --user <username> --password <password> [--display <name>]
  remove  --user <username>
  list
  reset   --user <username> --password <password>

Examples:
  npx ts-node scripts/manage-accounts.ts add --user roadcaster-ob1 --password mypassword
  npx ts-node scripts/manage-accounts.ts add --user tieline-studio --password studiopass --display "Studio Tieline"
  npx ts-node scripts/manage-accounts.ts remove --user roadcaster-ob1
  npx ts-node scripts/manage-accounts.ts list
`);
}

function parseArgs(): { command: string; user?: string; password?: string; display?: string } {
  const args = process.argv.slice(2);
  const result: any = { command: args[0] };

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (key && value) result[key] = value;
  }

  return result;
}

function addAccount(user: string, password: string, displayName?: string): void {
  const accounts = loadAccounts();

  if (accounts.has(user)) {
    console.error(`Account '${user}' already exists. Use 'reset' to change password.`);
    process.exit(1);
  }

  const ha1 = computeHA1(user, config.realm, password);
  const account: SipAccount = {
    username: user,
    ha1,
    realm: config.realm,
    displayName,
  };

  accounts.set(user, account);
  saveAccounts(accounts);
  console.log(`Account '${user}' created.`);
  console.log(`  Realm: ${config.realm}`);
  console.log(`  HA1: ${ha1}`);
}

function removeAccount(user: string): void {
  const accounts = loadAccounts();

  if (!accounts.has(user)) {
    console.error(`Account '${user}' not found.`);
    process.exit(1);
  }

  accounts.delete(user);
  saveAccounts(accounts);
  console.log(`Account '${user}' removed.`);
}

function listAccounts(): void {
  const accounts = loadAccounts();

  if (accounts.size === 0) {
    console.log('No accounts configured.');
    return;
  }

  console.log(`\nSIP Accounts (${accounts.size}):`);
  console.log('─'.repeat(50));

  for (const [username, account] of accounts) {
    const display = account.displayName ? ` (${account.displayName})` : '';
    console.log(`  ${username}${display}`);
    console.log(`    Realm: ${account.realm}`);
    console.log(`    HA1:   ${account.ha1}`);
    console.log();
  }
}

function resetPassword(user: string, password: string): void {
  const accounts = loadAccounts();

  if (!accounts.has(user)) {
    console.error(`Account '${user}' not found.`);
    process.exit(1);
  }

  const existing = accounts.get(user)!;
  const ha1 = computeHA1(user, config.realm, password);
  existing.ha1 = ha1;
  accounts.set(user, existing);
  saveAccounts(accounts);
  console.log(`Password reset for '${user}'.`);
  console.log(`  New HA1: ${ha1}`);
}

// Main
const { command, user, password, display } = parseArgs();

switch (command) {
  case 'add':
    if (!user || !password) {
      console.error('Error: --user and --password are required for add');
      usage();
      process.exit(1);
    }
    addAccount(user, password, display);
    break;

  case 'remove':
    if (!user) {
      console.error('Error: --user is required for remove');
      usage();
      process.exit(1);
    }
    removeAccount(user);
    break;

  case 'list':
    listAccounts();
    break;

  case 'reset':
    if (!user || !password) {
      console.error('Error: --user and --password are required for reset');
      usage();
      process.exit(1);
    }
    resetPassword(user, password);
    break;

  default:
    usage();
    process.exit(command ? 1 : 0);
}
