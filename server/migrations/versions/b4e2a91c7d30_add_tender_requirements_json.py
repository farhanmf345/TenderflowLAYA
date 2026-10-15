"""add_tender_requirements_json

Revision ID: b4e2a91c7d30
Revises: 17c59d7ac00b
Create Date: 2026-10-12 12:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4e2a91c7d30'
down_revision: Union[str, Sequence[str], None] = '17c59d7ac00b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('TenderDetails', sa.Column('Requirements_JSON', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('TenderDetails', 'Requirements_JSON')
