"""add common fields to attendance tables"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import MetaData

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    meta = MetaData()
    meta.reflect(bind=bind)
    for table_name in meta.tables:
        if table_name.startswith('attendance_'):
            with op.batch_alter_table(table_name) as batch_op:
                batch_op.add_column(
                    sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()'))
                )
                batch_op.add_column(
                    sa.Column('updated_at', sa.TIMESTAMP(timezone=True))
                )
                batch_op.add_column(
                    sa.Column('source', sa.String(length=32), server_default='web')
                )

def downgrade():
    bind = op.get_bind()
    meta = MetaData()
    meta.reflect(bind=bind)
    for table_name in meta.tables:
        if table_name.startswith('attendance_'):
            with op.batch_alter_table(table_name) as batch_op:
                batch_op.drop_column('source')
                batch_op.drop_column('updated_at')
                batch_op.drop_column('created_at')
