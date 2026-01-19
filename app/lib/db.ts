import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DECKS_FILE = path.join(DATA_DIR, 'decks.json');

async function ensureDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (e) { }
}

export async function saveUser(user: any) {
    await ensureDir();
    let users = [];
    try {
        const data = await fs.readFile(USERS_FILE, 'utf-8');
        users = JSON.parse(data);
    } catch (e) { }

    const index = users.findIndex((u: any) => u.email === user.email);
    if (index >= 0) {
        // Update existing
        users[index] = { ...users[index], ...user };
    } else {
        // Create new
        users.push(user);
    }

    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    return user;
}

export async function getDecks(userId: string) {
    await ensureDir();
    try {
        const data = await fs.readFile(DECKS_FILE, 'utf-8');
        const decks = JSON.parse(data);
        return decks.filter((d: any) => d.userId === userId).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (e) {
        return [];
    }
}

export async function createDeck(deck: any) {
    await ensureDir();
    let decks = [];
    try {
        const data = await fs.readFile(DECKS_FILE, 'utf-8');
        decks = JSON.parse(data);
    } catch (e) { }

    decks.push(deck);
    await fs.writeFile(DECKS_FILE, JSON.stringify(decks, null, 2));
    return deck;
}

export async function deleteDeck(deckId: string, userId: string) {
    await ensureDir();
    try {
        const data = await fs.readFile(DECKS_FILE, 'utf-8');
        let decks = JSON.parse(data);
        const newDecks = decks.filter((d: any) => d.id !== deckId || d.userId !== userId);

        if (decks.length === newDecks.length) return false;

        await fs.writeFile(DECKS_FILE, JSON.stringify(newDecks, null, 2));
        return true;
    } catch (e) {
        return false;
    }
}
