export async function createSession(
    db,
    token,
    userId,
    expiresAt
) {

    return db
        .prepare(`
            INSERT INTO sessions (
                id,
                user_id,
                expires_at
            )
            VALUES (?, ?, ?)
        `)
        .bind(
            token,
            userId,
            expiresAt
        )
        .run();
}

export async function getSession(
    db,
    token
) {

    return db
        .prepare(`
            SELECT
                sessions.*,
                users.email,
                users.role
            FROM sessions
            JOIN users
                ON users.id = sessions.user_id
            WHERE sessions.id = ?
            LIMIT 1
        `)
        .bind(token)
        .first();
}

export async function deleteSession(
    db,
    token
) {

    return db
        .prepare(`
            DELETE FROM sessions
            WHERE id = ?
        `)
        .bind(token)
        .run();
}

export async function getUserByEmail(
 db,
 email
){
 return db.prepare(`
 SELECT *
 FROM users
 WHERE email=?
 LIMIT 1
 `)
 .bind(email)
 .first();
}

export async function getUserById(
 db,
 id
){
 return db.prepare(`
 SELECT *
 FROM users
 WHERE id=?
 LIMIT 1
 `)
 .bind(id)
 .first();
}

export async function updateUserPassword(
 db,
 userId,
 passwordHash
){
 return db.prepare(`
 UPDATE users
 SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
 WHERE id = ?
 `)
 .bind(passwordHash, userId)
 .run();
}

// ── Password reset tokens ──
// Only a hash of the token is ever stored; see migrations/0038.

export async function createPasswordReset(
 db,
 userId,
 tokenHash,
 expiresAt
){
 return db.prepare(`
 INSERT INTO password_resets (user_id, token_hash, expires_at)
 VALUES (?, ?, ?)
 `)
 .bind(userId, tokenHash, expiresAt)
 .run();
}

export async function getPasswordResetByTokenHash(
 db,
 tokenHash
){
 return db.prepare(`
 SELECT *
 FROM password_resets
 WHERE token_hash = ?
 LIMIT 1
 `)
 .bind(tokenHash)
 .first();
}

export async function markPasswordResetUsed(
 db,
 id
){
 return db.prepare(`
 UPDATE password_resets
 SET used_at = CURRENT_TIMESTAMP
 WHERE id = ?
 `)
 .bind(id)
 .run();
}

// Invalidates every still-usable reset token for a user. Called after
// a successful reset (and before issuing a new one) so an old,
// forwarded, or leaked reset email can't also be used.
export async function invalidateUserPasswordResets(
 db,
 userId
){
 return db.prepare(`
 UPDATE password_resets
 SET used_at = CURRENT_TIMESTAMP
 WHERE user_id = ? AND used_at IS NULL
 `)
 .bind(userId)
 .run();
}
