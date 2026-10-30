"""classement multijoueur séparé : cote Elo et statistiques multijoueur

Les parties multijoueur comptaient jusqu'ici dans les statistiques solo
(games_played, games_won, total_score, best_score). Elles en sont retirées et
recopiées dans les nouvelles colonnes mp_* à partir de l'historique.
La cote Elo démarre à 1200 pour tout le monde (pas de recalcul du passé).

Revision ID: 0010_mp_ranking
Revises: 0009_chat
Create Date: 2026-10-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_mp_ranking"
down_revision = "0009_chat"
branch_labels = None
depends_on = None

MP_COLUMNS = (
    ("mp_rating", "1200"),
    ("mp_peak_rating", "1200"),
    ("mp_games", "0"),
    ("mp_wins", "0"),
    ("mp_draws", "0"),
    ("mp_total_score", "0"),
    ("mp_best_score", "0"),
)


def upgrade() -> None:
    for name, default in MP_COLUMNS:
        op.add_column("users", sa.Column(name, sa.Integer, nullable=False, server_default=default))
    op.add_column("game_histories", sa.Column("rating_delta", sa.Integer, nullable=True))
    op.create_index("ix_game_histories_mode_created", "game_histories", ["ai_difficulty", "created_at"])

    # SQL pur : compatible avec « alembic upgrade head --sql » (CI)
    # 1. Statistiques multijoueur tirées de l'historique
    op.execute("""
        UPDATE users SET
            mp_games       = s.n,
            mp_wins        = s.wins,
            mp_draws       = s.draws,
            mp_total_score = s.total,
            mp_best_score  = s.best
        FROM (
            SELECT user_id,
                   count(*)                                          AS n,
                   count(*) FILTER (WHERE won)                       AS wins,
                   count(*) FILTER (WHERE NOT won AND user_score = ai_score) AS draws,
                   coalesce(sum(user_score), 0)                      AS total,
                   coalesce(max(user_score), 0)                      AS best
            FROM game_histories
            WHERE ai_difficulty = 'multiplayer'
            GROUP BY user_id
        ) AS s
        WHERE users.id = s.user_id
    """)
    # 2. Statistiques solo : on retire la part multijoueur
    op.execute("""
        UPDATE users SET
            games_played  = greatest(games_played - mp_games, 0),
            games_won     = greatest(games_won - mp_wins, 0),
            total_score   = greatest(total_score - mp_total_score, 0),
            -- Record solo : le meilleur score solo de l'historique ; l'ancien record
            -- est gardé s'il dépasse tout score multijoueur (il venait donc du solo).
            best_score    = greatest(
                coalesce((
                    SELECT max(h.user_score) FROM game_histories h
                    WHERE h.user_id = users.id AND h.ai_difficulty <> 'multiplayer'
                ), 0),
                CASE WHEN best_score > mp_best_score THEN best_score ELSE 0 END
            )
        WHERE mp_games > 0
    """)
    op.execute("""
        UPDATE users SET average_score = CASE
            WHEN games_played > 0 THEN round(total_score::numeric / games_played, 2)
            ELSE 0 END
        WHERE mp_games > 0
    """)


def downgrade() -> None:
    # Les parties multijoueur reviennent dans les statistiques solo
    op.execute("""
        UPDATE users SET
            games_played  = games_played + mp_games,
            games_won     = games_won + mp_wins,
            total_score   = total_score + mp_total_score,
            best_score    = greatest(best_score, mp_best_score),
            average_score = CASE WHEN games_played + mp_games > 0
                THEN round((total_score + mp_total_score)::numeric / (games_played + mp_games), 2)
                ELSE 0 END
        WHERE mp_games > 0
    """)
    op.drop_index("ix_game_histories_mode_created", table_name="game_histories")
    op.drop_column("game_histories", "rating_delta")
    for name, _ in reversed(MP_COLUMNS):
        op.drop_column("users", name)
