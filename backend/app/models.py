from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    rules = relationship("CategoryRule", back_populates="category", cascade="all, delete-orphan")


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("Category", back_populates="rules")


class AppConfig(Base):
    """Key-value store for runtime config (e.g. Gmail historyId)."""
    __tablename__ = "app_config"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    merchant = Column(String, index=True)
    transaction_type = Column(String, index=True)  # "debit" or "credit"
    category = Column(String, index=True, default="Uncategorized")
    date = Column(Date, nullable=False, index=True)
    raw_email_snippet = Column(String)
    gmail_message_id = Column(String, unique=True, index=True, nullable=True)  # nullable for manual/statement
    source = Column(String, default="email")  # "email", "statement", "manual"
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
