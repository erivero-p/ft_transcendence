from abc import ABC, abstractmethod
import copy
from .ChessGameMode import ChessGameMode
from ..pieces import Rook, Knight, Bishop, Queen, King, Pawn
from ..utils import is_in_check, is_checkmate, is_stalemate, is_insufficient_material

import logging
logger = logging.getLogger('chess_game')
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

class BombChess(ChessGameMode):
    def __init__(self):
        self.half_move_clock = 0
        self.position_history = []
        self.en_passant_target = None

    def initialize_board(self):
        board = {}
        # White pieces
        board["a1"] = Rook("white", "a1", "1")
        board["b1"] = Knight("white", "b1", "1")
        board["c1"] = Bishop("white", "c1", "1")
        board["d1"] = Queen("white", "d1", "")
        board["e1"] = King("white", "e1", "")
        board["f1"] = Bishop("white", "f1", "2")
        board["g1"] = Knight("white", "g1", "2")
        board["h1"] = Rook("white", "h1", "2")
        for file_idx, file in enumerate("abcdefgh"):
            board[f"{file}2"] = Pawn("white", f"{file}2", str(file_idx + 1))
        # Black pieces
        board["a8"] = Rook("black", "a8", "1")
        board["b8"] = Knight("black", "b8", "1")
        board["c8"] = Bishop("black", "c8", "1")
        board["d8"] = Queen("black", "d8", "")
        board["e8"] = King("black", "e8", "")
        board["f8"] = Bishop("black", "f8", "2")
        board["g8"] = Knight("black", "g8", "2")
        board["h8"] = Rook("black", "h8", "2")
        for file_idx, file in enumerate("abcdefgh"):
            board[f"{file}7"] = Pawn("black", f"{file}7", str(file_idx + 1))
        # Empty squares
        for rank in range(3, 7):
            for file in "abcdefgh":
                board[f"{file}{rank}"] = None

        self.position_history.append(self.get_position_key(board))
        return board

    def get_position_key(self, board):
        key = []
        for rank in range(8, 0, -1):
            for file in "abcdefgh":
                piece = board.get(f"{file}{rank}")
                if piece is None:
                    key.append(".")
                else:
                    key.append(str(piece))
        return "".join(key)

    def check_game_over(self, board, current_player):
        if is_checkmate(board, current_player):
            return "checkmate", "black" if current_player == "white" else "white"
        if is_stalemate(board, current_player):
            return "stalemate", None
        if self.half_move_clock >= 100:
            return "fifty_moves", None
        position_key = self.get_position_key(board)
        if self.position_history.count(position_key) >= 3:
            return "repetition", None
        if is_insufficient_material(board):
            return "insufficient_material", None
        white_king_alive = any(isinstance(piece, King) and piece.color == "white" for piece in board.values())
        black_king_alive = any(isinstance(piece, King) and piece.color == "black" for piece in board.values())
        if not white_king_alive or not black_king_alive:
            winner = "black" if not white_king_alive else "white"
            return "king exploded", winner
        return None, None

    # Implementing the interface; only piece_type and color are considered.
    def create_piece(self, piece_type, color):
        piece_classes = {
            'pawn': Pawn,
            'rook': Rook,
            'knight': Knight,
            'bishop': Bishop,
            'queen': Queen,
            'king': King
        }
        if piece_type.lower() in piece_classes:
            # Create the piece with default empty position and id.
            return piece_classes[piece_type.lower()](color, "", "")
        return None

    def validate_move(self, board, from_pos, to_pos, player_color, promotion_choice=None):
        # Detect castling via king movement
        if from_pos in board and isinstance(board[from_pos], King):
            king = board[from_pos]
            if not king.has_moved:
                file_from = from_pos[0]
                file_to = to_pos[0]
                # Castling short (king side): king moves from e to g
                if file_from == 'e' and file_to == 'g':
                    return self.process_castling(board, player_color, "king_side")
                # Castling long (queen side): king moves from e to c
                if file_from == 'e' and file_to == 'c':
                    return self.process_castling(board, player_color, "queen_side")
        # Normal move validations
        if from_pos not in board or board[from_pos] is None:
            return False, "No piece at the starting position", board, {}
        piece = board[from_pos]
        if piece.color != player_color:
            return False, "You cannot move your opponent's pieces", board, {}
        possible_moves = piece.get_possible_moves(board, self.en_passant_target) if isinstance(piece, Pawn) else piece.get_possible_moves(board)

        if to_pos not in possible_moves:
            return False, "Invalid move for this piece", board, {}

        new_board = copy.deepcopy(board)
        captured_piece = new_board[to_pos]
        en_passant_capture = False

        if isinstance(piece, Pawn) and to_pos == self.en_passant_target:
            file_to = to_pos[0]
            rank_from = from_pos[1]
            en_passant_capture = True
            captured_position = f"{file_to}{rank_from}"
            captured_piece = new_board[captured_position]
            new_board[captured_position] = None


        new_board[to_pos] = piece
        new_board[from_pos] = None
        piece.position = to_pos
        piece.has_moved = True

        # Verify if move leaves king in check.
        if is_in_check(new_board, player_color):
            return False, "You cannot make a move that leaves your king in check", board, {}

        if isinstance(piece, Pawn) or captured_piece is not None:
            self.half_move_clock = 0
        else:
            self.half_move_clock += 1

        position_key = self.get_position_key(new_board)
        self.position_history.append(position_key)
        old_en_passant = self.en_passant_target
        self.en_passant_target = None

        if isinstance(piece, Pawn):
            file_from, rank_from = from_pos[0], int(from_pos[1])
            file_to, rank_to = to_pos[0], int(to_pos[1])
            
            if abs(rank_to - rank_from) == 2:
                intermediate_rank = (rank_from + rank_to) // 2
                self.en_passant_target = f"{file_to}{intermediate_rank}"

        promotion = None
        promotion_pending = False
        # Pawn promotion logic
        if isinstance(piece, Pawn):
            if (piece.color == "white" and to_pos[1] == "8") or (piece.color == "black" and to_pos[1] == "1"):
                if promotion_choice:
                    new_piece = self.create_piece(promotion_choice, piece.color)
                    if new_piece:
                        new_piece.position = to_pos
                        new_board[to_pos] = new_piece
                        promotion = promotion_choice
                else:
                    promotion_pending = True

        info = {
            "captured": captured_piece.piece_id if captured_piece else None,
            "en_passant": {
                "capture": en_passant_capture,
                "target": self.en_passant_target,
                "prev_target": old_en_passant
            },
            "promotion": promotion,
            "promotion_pending": promotion_pending,
            "half_move_clock": self.half_move_clock
        }

        if promotion_pending:
            logger.debug(f"Promotion pending info: {info}")
            return True, "Valid move, promotion required", new_board, info
         # Special rule for Bomb Chess: affect all adjacent pieces except pawns
        if captured_piece:
            logger.debug(f"Bomb captured piece: {captured_piece.__class__.__name__} at {to_pos}")
            affected_positions = self.get_surrounding_squares(to_pos)
            for pos in affected_positions:
                if pos in new_board and new_board[pos] and not isinstance(new_board[pos], Pawn):
                    logger.debug(f"Removing piece: {new_board[pos].__class__.__name__} at {pos}")
                    new_board[pos] = None

        opponent_color = "black" if player_color == "white" else "white"
        game_over_status, winner = self.check_game_over(new_board, opponent_color)

        if game_over_status:
            info["game_over"] = {
                "status": game_over_status,
                "winner": winner
            }
            
        return True, "Valid move", new_board, info

    def process_castling(self, board, player_color, side):
        rank = "1" if player_color == "white" else "8"
        king_pos = f"e{rank}"
        if king_pos not in board or not isinstance(board[king_pos], King) or board[king_pos].has_moved:
            return False, "Invalid castling: the king has already moved", board, {}

        if side == "king_side":
            rook_pos = f"h{rank}"
            king_target = f"g{rank}"
            rook_target = f"f{rank}"
        else:
            rook_pos = f"a{rank}"
            king_target = f"c{rank}"
            rook_target = f"d{rank}"

        if rook_pos not in board or not isinstance(board[rook_pos], Rook) or board[rook_pos].has_moved:
            return False, "Invalid castling: the rook has already moved", board, {}

        if side == "king_side":
            for file in ["f", "g"]:
                if board.get(f"{file}{rank}") is not None:
                    return False, "Invalid castling: there are pieces between the king and rook", board, {}
        else:
            for file in ["b", "c", "d"]:
                if board.get(f"{file}{rank}") is not None:
                    return False, "Invalid castling: there are pieces between the king and rook", board, {}

        if is_in_check(board, player_color):
            return False, "Invalid castling: the king is in check", board, {}

        if side == "king_side":
            for file in ["f", "g"]:
                test_board = copy.deepcopy(board)
                test_board[f"{file}{rank}"] = test_board[king_pos]
                test_board[king_pos] = None
                if is_in_check(test_board, player_color):
                    return False, "Invalid castling: the king would pass through an attacked square", board, {}
        else:
            for file in ["c", "d"]:
                test_board = copy.deepcopy(board)
                test_board[f"{file}{rank}"] = test_board[king_pos]
                test_board[king_pos] = None
                if is_in_check(test_board, player_color):
                    return False, "Invalid castling: the king would pass through an attacked square", board, {}

        new_board = copy.deepcopy(board)
        new_board[king_target] = new_board[king_pos]
        new_board[king_pos] = None
        new_board[king_target].position = king_target
        new_board[king_target].has_moved = True
        new_board[rook_target] = new_board[rook_pos]
        new_board[rook_pos] = None
        new_board[rook_target].position = rook_target
        new_board[rook_target].has_moved = True

        self.half_move_clock += 1
        position_key = self.get_position_key(new_board)
        self.position_history.append(position_key)

        info = {
            "castling": side,
            "half_move_clock": self.half_move_clock
        }
        opponent_color = "black" if player_color == "white" else "white"
        game_over_status, winner = self.check_game_over(new_board, opponent_color)
        if game_over_status:
            info["game_over"] = {
                "status": game_over_status,
                "winner": winner
            }

        return True, "Castling completed", new_board, info

    def complete_promotion(self, board, position, promotion_choice):
        """
        Completes a pending pawn promotion.
        Args:
            board: The current board state.
            position: Position of the pawn to be promoted.
            promotion_choice: The chosen piece type for promotion.
        Returns:
            (success, message, new_board, info)
        """
        logger.debug(f"on complete_promotion: postition: {position} / promotion: {promotion_choice} / board: {board[position]}")
        if position not in board or board[position] is None or board[position].__class__.__name__.lower() != "pawn":
            return False, "No pawn at position for promotion", board, {}
        piece = board[position]

        new_piece = self.create_piece(promotion_choice, piece.color)
        if not new_piece:
            return False, "Invalid promotion piece type", board, {}
        new_piece.position = position

        new_board = copy.deepcopy(board)
        new_board[position] = new_piece

        info = {
            "promotion": promotion_choice
        }
        opponent_color = "black" if piece.color == "white" else "white"
        game_over_status, winner = self.check_game_over(new_board, opponent_color)
        if game_over_status:
            info["game_over"] = {
                "status": game_over_status,
                "winner": winner
            }
        return True, "Promotion completed", new_board, info

    def get_surrounding_squares(self, pos):
        file, rank = pos[0], int(pos[1])
        surrounding_squares = []
        for df in [-1, 0, 1]:
            for dr in [-1, 0, 1]:
                if df == 0 and dr == 0:
                    continue
                new_file = chr(ord(file) + df)
                new_rank = rank + dr
                if 'a' <= new_file <= 'h' and 1 <= new_rank <= 8:
                    surrounding_squares.append(f"{new_file}{new_rank}")
        return surrounding_squares
