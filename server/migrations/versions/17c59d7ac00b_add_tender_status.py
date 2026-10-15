"""add_tender_status

Revision ID: 17c59d7ac00b
Revises: fbc5b766e1f7
Create Date: 2026-05-25 16:24:15.862438

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '17c59d7ac00b'
down_revision: Union[str, Sequence[str], None] = 'fbc5b766e1f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('TenderDetails', sa.Column('Tender_Status', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('TenderDetails', 'Tender_Status')
